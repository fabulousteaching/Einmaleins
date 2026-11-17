/* Einmaleins: Verbindung zu Supabase (Anmeldung der Lehrpersonen, Klassen, Kinder-Logins)

   Dasselbe Supabase-Projekt wie Vokaboom: Lehrpersonen melden sich mit demselben Konto an.
   Einmaleins hat eigene Tabellen (einmaleins_…), die Daten von Vokaboom bleiben unberührt.
   Einmalig in Supabase supabase/einmaleins.sql ausführen (siehe supabase/ANLEITUNG.md).

   Beide Werte dürfen öffentlich sein: Die Daten schützen die Zugriffsregeln aus supabase/einmaleins.sql.
   Den «secret» bzw. «service_role» Schlüssel nie hier eintragen.
   Bleiben die Werte leer, läuft Einmaleins ohne Anmeldung (alle Übungen und Spiele gehen trotzdem). */
window.EINMALEINS_CONFIG = {
  supabaseUrl: 'https://cppgdrwpwcshtbavesrm.supabase.co',
  supabaseKey: 'sb_publishable_66QwDLf_H_O1aNdn2mP1LA_A40he3mM',   // «Publishable key», darf öffentlich sein
  vokaboomUrl: 'https://vokaboom.fabulousteaching.ch/',   // für den zweiten QR-Code auf den Login-Kärtchen
};
