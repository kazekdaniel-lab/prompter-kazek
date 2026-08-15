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

### Logowanie mailem (docelowe)

Dostęp mają dwa adresy: `kaziu1804@gmail.com` i `kazekdaniel@gmail.com`. Logowanie idzie mailem - w wiadomości jest link i 6-cyfrowy kod. Kod jest ważniejszy niż link, bo apka dodana do ekranu głównego ma własny magazyn danych i link kliknięty w Safari nie zalogowałby jej; wpisanie 6 cyfr działa wszędzie. **Sesja trzyma 30 dni**, potem trzeba zalogować się jeszcze raz (limit liczy się od logowania, odświeżanie tokenu go nie przedłuża).

Backend: Supabase (darmowy plan). Konfiguracja jest jednorazowa:

1. Załóż projekt na [supabase.com](https://supabase.com) (region Frankfurt).
2. **SQL Editor** → wklej całe `supabase.sql` → **Run**. Tworzy tabelę `scripts` i RLS wpuszczający tylko te dwa adresy.
3. **Authentication → URL Configuration**: *Site URL* = `https://kazekdaniel-lab.github.io/prompter/`, w *Redirect URLs* dodaj `https://kazekdaniel-lab.github.io/prompter/**`.
4. **Authentication → Emails → Magic Link**: wstaw kod do treści maila, np.

   ```html
   <h2>Prompter - logowanie</h2>
   <p>Kod do wpisania w apce:</p>
   <p style="font-size:30px;letter-spacing:8px"><b>{{ .Token }}</b></p>
   <p>Albo kliknij tutaj na tym urządzeniu: <a href="{{ .ConfirmationURL }}">Zaloguj</a></p>
   ```

5. **Project Settings → API**: skopiuj *Project URL* i klucz *anon / publishable* do `config.js` i wypchnij zmianę. To wartości jawne, przeznaczone do frontendu - dostępu pilnuje RLS z punktu 2.

Wbudowana wysyłka maili Supabase jest mocno limitowana (kilka wiadomości na godzinę). Przy logowaniu raz na 30 dni to bez znaczenia; gdyby przeszkadzało, można podpiąć własny SMTP (np. Resend).

Dopóki `config.js` jest pusty, logowanie się nie pokazuje, a apka działa lokalnie albo na parowaniu kodem (niżej).

### Zapasowo: wspólna baza skryptów przez Gista

Droga bez zakładania konta w Supabase: skrypty leżą w **prywatnym Gistcie na GitHubie**, a telefon paruje się kodem. Działa dalej, ale logowanie mailem jest wygodniejsze.

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
