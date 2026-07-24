# Prompter

Prosty teleprompter do nagrywania self-video na telefonie. Kamera do siebie, przewijany tekst tuż przy obiektywie, regulowana prędkość - czytasz, a na nagraniu wyglądasz, jakbyś mówił prosto do kamery.

Darmowy, bez logowania, bez subskrypcji. Wszystko dzieje się lokalnie na urządzeniu - nagranie nigdzie się nie wysyła.

## Jak używać na iPhonie

1. Otwórz stronę w Safari (adres HTTPS - wymagany, żeby przeglądarka dała dostęp do kamery).
2. Zezwól na dostęp do kamery i mikrofonu.
3. Tapnij **Udostępnij → Do ekranu początkowego**, żeby mieć ikonę jak zwykła apka (pełny ekran, działa offline).
4. Wklej tekst (przycisk **Skrypty**), ustaw prędkość i rozmiar (**Ustawienia**), tapnij czerwony przycisk.
5. Po nagraniu tapnij **Zapisz / Udostępnij → Zapisz wideo**, żeby trafiło do rolki.

## Funkcje

- Podgląd przedniej kamery na cały ekran (lustrzany; nagranie zostaje normalne)
- Przewijany tekst przy obiektywie, regulacja prędkości (także w trakcie nagrania)
- Regulacja czcionki, wysokości panelu, szerokości tekstu, krycia tła
- Wiele zapisanych skryptów (intro, outro, oferta...) w pamięci przeglądarki
- Odliczanie 3-2-1 przed startem
- Nagrywanie obrazu z kamery + dźwięku (bez tekstu w pliku)
- Ekran nie gaśnie, działa offline (PWA)

## Technicznie

Czysty HTML/CSS/JS, bez zależności. `getUserMedia` + `MediaRecorder` (na iOS zapis do `video/mp4`), `localStorage`, Web Share API, Screen Wake Lock, service worker do trybu offline.
