/* Konfiguracja logowania i chmury.
   supabaseUrl + supabaseKey to wartości publiczne (klucz "anon" jest przeznaczony do frontendu) -
   dostępu do danych pilnuje RLS w bazie, opisane w supabase.sql. */
window.TP_CONFIG = {
  supabaseUrl: '',            // np. https://abcdefgh.supabase.co
  supabaseKey: '',            // klucz anon / publishable
  allowed: ['kaziu1804@gmail.com', 'kazekdaniel@gmail.com'],
  sessionDays: 30             // po tylu dniach trzeba zalogować się na nowo
};
