# Plan zmiennych — kandydaci do włączenia

Stan na 2026-07-20. Zweryfikowane bezpośrednio w API BDL (poziomy = faktycznie
zwracające dane; lata = zakres z próbki). Poziomy BDL: 2 = województwo,
4 = podregion, 5 = powiat, 6 = gmina.

## Już na stronie

| Zmienna | Źródło | Poziomy | Lata |
|---|---|---|---|
| Bezrobocie rejestrowane wg płci | BDL P2670 (79214-16) | 4, 5, 6 | 2003-2025 |
| Aktywność zawodowa wg płci i wieku | BDL P4309 (NSP 2021) | 4, 5 | 2021 |
| Egzamin ósmoklasisty (polski/matematyka/angielski) wg płci | CKE (dostęp do informacji publicznej) | 5 | 2022-2025 |

## Kandydaci z BDL — zweryfikowani, do decyzji

| # | Zmienna | Subject | Wymiary | Poziomy | Lata | Uwagi |
|---|---|---|---|---|---|---|
| 1 | **Przeciętne dalsze trwanie życia** | P2730 | płeć × miasto/wieś × wiek (0/15/30/45/60/65) | 2, **4** | 2007-2024 | Potwierdza się "tylko podregiony" z pitchu. 36 wariantów. |
| 2 | **Radni gminy wg płci** | P1312 (6/7/8) | płeć | 2, 4, 5, **6** | 1995-2025 | LICZEBNOŚCI → `sharesMeaningful` (% kobiet w radach!). Pokrywa część "płci u władzy" bez PKW. |
| 3 | **Radni powiatu wg płci** | P1317 (3094-96) | płeć | 2, 4, 5 | 1999-2025 | jw.; istnieją też odpowiedniki dla sejmików i dzielnic Warszawy (P1400). |
| 4 | **Zdawalność matur wg typu szkoły i płci** | P3374 | typ szkoły × płeć | 2, 4, 5, 6 | 2002-2018 | Seria chyba zakończona (szkoły ponadgimnazjalne, sprzed reformy) — do sprawdzenia czy jest kontynuacja w nowym przekroju. P3193 (nowsze formuły) tylko wojewódzko. |
| 5 | **Uczniowie/absolwenci liceów wg płci** | P2144 (270621/270655, 270602/270638 + technika, branżowe) | typ szkoły × płeć | 4, 5, 6, (7) | do zbadania pełen zakres | Pitch: "proporcje płci w liceach". LICZEBNOŚCI → `sharesMeaningful`. Notebook ma pełną listę ID (cell 41). |
| 6 | **Ludność wg wieku i płci (25-34)** | P4253 / P1342 | płeć × roczniki 5-letnie | 5, 6 | NSP 2021 / bieżące roczne | Pitch: migracje selektywne. LICZEBNOŚCI. Notebook: demo_sh_men2534 z 1644517/18/37/38. Bieżąca ewidencja (P1342) daje szereg roczny zamiast jednego roku spisowego. |
| 7 | **Pracujący wg sekcji PKD i płci** | P4283 (NSP 2021) | sekcja PKD (A-S) × płeć | 5 | 2021 | Surowiec do **indeksu segregacji zawodowej** (formuła TBD — Duncan?). 756 wariantów, notebook ma mapowanie (cell 51). |
| 8 | **Wynagrodzenia** | P2497 (64428/29) | tylko ogółem | 5 | ~2002-2024 | **BDL nie ma podziału na płeć na poziomie powiatu.** Płeć: publikacja GUS "Rozkład wynagrodzeń…" (Excel, notebook cell 73-74; średnia + mediana, powiat) — wgrywana ręcznie jak CKE, dostępna od edycji 2025(?) — sprawdzić wstecz. |

## Poza BDL (ręczne, jak CKE)

- **PKW — proporcje płci u władzy** (wójtowie/burmistrzowie/prezydenci,
  posłowie wg okręgów?): radnych pokrywa BDL (wyżej), więc PKW potrzebne
  głównie dla organów wykonawczych i Sejmu. Użytkownik ma doświadczenie z danymi PKW.
- **Wynagrodzenia wg płci** — Excel GUS jw. (pozycja 8).

## Świadomie pominięte na razie

- E8 z pozostałych języków (mało zdających), spis rolny P4272 (właściciele
  gospodarstw wg płci — jednorazowe, niszowe), zmienne kontekstowe
  (gęstość zaludnienia itp. — przydatne później do narzędzia korelacji).
