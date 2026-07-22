"""Minimal tolerant parser for JS object-literal source (subset used by variables.js):
bare/quoted identifier keys, single/double-quoted strings (with `+` concatenation),
numbers, booleans, nested objects/arrays, // and /* */ comments, trailing commas.
Not a general JS parser -- just enough to load VARIABLE_META without a JS runtime.
"""
import re


class Tokenizer:
    def __init__(self, src):
        self.src = src
        self.i = 0
        self.n = len(src)

    def peek_char(self):
        return self.src[self.i] if self.i < self.n else ""

    def skip_ws_comments(self):
        while self.i < self.n:
            c = self.src[self.i]
            if c in " \t\r\n":
                self.i += 1
            elif c == "/" and self.src[self.i : self.i + 2] == "//":
                j = self.src.find("\n", self.i)
                self.i = j + 1 if j != -1 else self.n
            elif c == "/" and self.src[self.i : self.i + 2] == "/*":
                j = self.src.find("*/", self.i)
                self.i = j + 2 if j != -1 else self.n
            else:
                break

    def next_token(self):
        self.skip_ws_comments()
        if self.i >= self.n:
            return ("EOF", None)
        c = self.src[self.i]
        if c in "{}[]:,+":
            self.i += 1
            return (c, c)
        if c in "\"'":
            return self._read_string(c)
        if c == "-" or c.isdigit():
            return self._read_number()
        if c.isalpha() or c == "_" or c == "$":
            return self._read_ident()
        raise ValueError(f"Unexpected char {c!r} at {self.i} near {self.src[self.i:self.i+40]!r}")

    def _read_string(self, quote):
        j = self.i + 1
        out = []
        while j < self.n and self.src[j] != quote:
            if self.src[j] == "\\":
                nxt = self.src[j + 1]
                esc = {"n": "\n", "t": "\t", "\\": "\\", '"': '"', "'": "'", "\n": ""}
                out.append(esc.get(nxt, nxt))
                j += 2
            else:
                out.append(self.src[j])
                j += 1
        self.i = j + 1
        return ("STRING", "".join(out))

    def _read_number(self):
        j = self.i
        if self.src[j] == "-":
            j += 1
        while j < self.n and (self.src[j].isdigit() or self.src[j] == "."):
            j += 1
        text = self.src[self.i : j]
        self.i = j
        return ("NUMBER", float(text) if "." in text else int(text))

    def _read_ident(self):
        j = self.i
        while j < self.n and (self.src[j].isalnum() or self.src[j] == "_" or self.src[j] == "$"):
            j += 1
        text = self.src[self.i : j]
        self.i = j
        if text == "true":
            return ("BOOL", True)
        if text == "false":
            return ("BOOL", False)
        if text == "null" or text == "undefined":
            return ("NULL", None)
        return ("IDENT", text)


class Parser:
    def __init__(self, src):
        self.tk = Tokenizer(src)
        self._pushed = None

    def _next(self):
        if self._pushed is not None:
            t = self._pushed
            self._pushed = None
            return t
        return self.tk.next_token()

    def _push(self, tok):
        self._pushed = tok

    def parse_value(self):
        kind, val = self._next()
        if kind == "{":
            return self._parse_object()
        if kind == "[":
            return self._parse_array()
        if kind == "STRING":
            return self._parse_string_concat(val)
        if kind in ("NUMBER", "BOOL", "NULL"):
            return val
        if kind == "IDENT":
            # bare reference like TOPICS.foo -- consume dotted path, return as marker string
            path = val
            while True:
                nk, nv = self._next()
                if nk == ".":
                    nk2, nv2 = self._next()
                    path += "." + str(nv2)
                else:
                    self._push((nk, nv))
                    break
            return f"<ref:{path}>"
        raise ValueError(f"Unexpected token {kind!r} {val!r}")

    def _parse_string_concat(self, first):
        parts = [first]
        while True:
            nk, nv = self._next()
            if nk == "+":
                nk2, nv2 = self._next()
                if nk2 != "STRING":
                    raise ValueError(f"Expected string after + , got {nk2}")
                parts.append(nv2)
            else:
                self._push((nk, nv))
                break
        return "".join(parts)

    def _parse_object(self):
        obj = {}
        while True:
            kind, val = self._next()
            if kind == "}":
                return obj
            if kind == ",":
                continue
            if kind in ("IDENT", "STRING"):
                key = val
            else:
                raise ValueError(f"Expected object key, got {kind} {val}")
            colon_kind, _ = self._next()
            if colon_kind != ":":
                raise ValueError(f"Expected ':' after key {key}, got {colon_kind}")
            obj[key] = self.parse_value()

    def _parse_array(self):
        arr = []
        while True:
            kind, val = self._next()
            if kind == "]":
                return arr
            if kind == ",":
                continue
            self._push((kind, val))
            arr.append(self.parse_value())


def parse_js_object_literal(src):
    """src must be the text starting right after `= ` and ending with the
    matching top-level value (trailing `;` is fine, it's just ignored since
    we stop once the top object/array closes)."""
    p = Parser(src)
    return p.parse_value()


def extract_const(js_source, name):
    m = re.search(rf"const\s+{re.escape(name)}\s*=\s*", js_source)
    if not m:
        raise ValueError(f"const {name} not found")
    return parse_js_object_literal(js_source[m.end() :])
