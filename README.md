# Prompter

Prosty teleprompter do nagrywania self-video na telefonie. Kamera do siebie, przewijany tekst tuż przy obiektywie, regulowana prędkość - czytasz, a na nagraniu wyglądasz, jakbyś mówił prosto do kamery.

Darmowy, bez logowania, bez subskrypcji. Wszystko dzieje się lokalnie na urządzeniu - nagranie nigdzie się nie wysyła.

## Jak używać na iPhonie

1. Otwórz stronę w Safari (adres HTTPS - wymagany, żeby przeglądarka dała dostęp do kamery).
2. Zezwól na dostęp do kamery i mikrofonu.
3. Tapnij **Udostępnij → Do ekranu początkowego**, żeby mieć ikonę jak zwykła apka (pełny ekran, działa offline).
4. Wklej tekst (przycisk **Skrypty**), ustaw prędkość i rozmiar (**Ustawienia**), tapnij czerwony przycisk.
5. Po nagraniu tapnij **Zapisz / Udostępnij → Zapisz wideo**, żeby trafiło do rolki.

## Dashboard (pisanie skryptów na komputerze)

`/dashboard.html` - zarządzanie skryptami z dużego ekranu: lista z wyszukiwarką, edytor z licznikiem słów i szacowanym czasem czytania, duplikowanie, kolejność (przeciągnij albo strzałki), wgrywanie plików `.txt` / `.md` (można je przeciągnąć na stronę), eksport i import JSON.

### Wspólna baza skryptów: komputer ↔ telefon

Skrypty można trzymać w **prywatnym Gistcie na GitHubie** - wtedy to, co napiszesz na komputerze, widać na telefonie i odwrotnie. Bez logowania, bez kont, bez backendu.

1. Na komputerze: dashboard → **Chmura** → utwórz token GitHuba z zakresem `gist` → wklej i **Połącz**. Gist tworzy się sam (albo znajduje istniejący).
2. W tym samym oknie skopiuj **kod parowania**.
3. Na telefonie: prompter → **Ustawienia → Chmura → Połącz kodem** i wklej kod (uniwersalny schowek Apple przenosi go z Maca na iPhone'a sam).

Synchronizacja idzie w obie strony: przy starcie, po powrocie do apki i po każdej zmianie. Scalanie po znaczniku czasu - wygrywa nowsza wersja danego skryptu; usunięcia też się przenoszą. Bez połączenia z chmurą wszystko działa dalej, tylko lokalnie.

## Funkcje

- Podgląd przedniej kamery na cały ekran (lustrzany; nagranie zostaje normalne)
- Przewijany tekst przy obiektywie, regulacja prędkości (także w trakcie nagrania)
- Regulacja czcionki, wysokości panelu, szerokości tekstu, krycia tła, zoom kamery
- Wiele zapisanych skryptów (intro, outro, oferta...), edytowalnych i na telefonie, i na komputerze
- Odliczanie 3-2-1 przed startem
- Nagrywanie obrazu z kamery + dźwięku (bez tekstu w pliku)
- Ekran nie gaśnie, działa offline (PWA)

## Technicznie

Czysty HTML/CSS/JS, bez zależności. `getUserMedia` + `MediaRecorder` (na iOS zapis do `video/mp4`), `localStorage`, Web Share API, Screen Wake Lock, service worker (sieć-najpierw z zapasem w cache). Warstwa danych i synchronizacja: `store.js` (GitHub Gist API, token trzymany tylko w pamięci przeglądarki).
