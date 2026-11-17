# Einmaleins mit Anmeldung einrichten

Einmaleins benutzt **dasselbe Supabase-Projekt wie Vokaboom**. Die Adresse und der öffentliche Schlüssel stehen schon in `js/config.js`.
Lehrpersonen melden sich deshalb mit ihrem Vokaboom-Konto an (gleiche E-Mail-Adresse, gleiches Passwort). Neue Lehrpersonen können sich in Einmaleins auch neu registrieren.

Einmaleins hat eigene Tabellen (alle beginnen mit `einmaleins_`). Das SQL-Skript ändert nichts an den Tabellen und Daten von Vokaboom. Einzige gewollte Verbindung: Gibst du einem aus Vokaboom übernommenen Kind in Einmaleins neue Bilder, gelten diese auch in Vokaboom (es ist ja dasselbe Kärtchen).

Alle Übungen und Spiele funktionieren auch ohne diese Einrichtung. Es braucht sie nur für Klassen, Kinder-Logins und die Übersicht.

## 1. Tabellen anlegen (einmalig, nach Änderungen nochmals)

1. Auf supabase.com das Projekt von Vokaboom öffnen.
2. Links **SQL Editor** öffnen, **New query**.
3. Den ganzen Inhalt von `supabase/einmaleins.sql` einfügen und **Run** klicken.
4. Es erscheint «Success. No rows returned». Mehrmals ausführen schadet nicht, bestehende Klassen und Übungsstände bleiben erhalten.

Hast du die Datei schon einmal ausgeführt, bevor es die Übernahme aus Vokaboom gab? Dann einfach nochmals ganz ausführen. Bis dahin zeigt Einmaleins bei „Aus Vokaboom übernehmen“ einen Hinweis.

## 2. Adresse von Einmaleins erlauben

**Authentication → URL Configuration → Redirect URLs**: die Adresse von Einmaleins hinzufügen, z. B.

- `https://einmaleins.fabulousteaching.ch/**`
- und `https://fabulousteaching.github.io/Einmaleins/**`

Die **Site URL** bleibt die von Vokaboom. Dorthin bzw. zu Einmaleins führen die Links in E-Mails (Konto bestätigen, Passwort vergessen). Ohne diesen Eintrag landen solche Links auf Vokaboom; das Anmelden mit E-Mail und Passwort funktioniert aber trotzdem.

Fertig. Oben rechts **Anmelden → Ich bin Lehrperson**.

## Klassen und Kinder-Logins

- **Klasse anlegen**, dann **Kinder** eintragen (Vorname und erster Buchstabe des Nachnamens, einzeln oder als Liste). Gespeichert wird nur der Vorname und der erste Buchstabe des Nachnamens.
- **Mit Vokaboom verbinden (beide Richtungen):** auf der Seite „Meine Klassen“ eine Vokaboom-Klasse übernehmen, oder in einer Einmaleins-Klasse unter „Kinder“ mit einer Vokaboom-Klasse verbinden bzw. sie in Vokaboom neu anlegen. Danach hat jedes Kind in beiden Tools denselben Benutzernamen und dieselben 3 Bilder – ein Kärtchen.
  - Neue Kinder in Einmaleins werden sofort auch in Vokaboom angelegt. Neue Kinder in Vokaboom kommen nach Einmaleins, sobald du die Klasse in Einmaleins öffnest oder sich das Kind in Einmaleins anmeldet.
  - Gleichnamige Kinder (gleicher Vorname und Anfangsbuchstabe) werden nicht doppelt angelegt, sondern verbunden; dann gilt das Vokaboom-Kärtchen, der Übungsstand bleibt.
  - Es gelten immer die aktuellen Bilder aus Vokaboom; „Neue Bilder“ in Einmaleins ändert sie auch dort.
  - Löschen in Einmaleins: „Nur in Einmaleins“ (das Kind bleibt in Vokaboom und wird nicht automatisch wieder geholt; „… hier gelöschte wieder holen“ holt es zurück) oder „Auch in Vokaboom“.
- Neue Kinder bekommen einen Benutzernamen, den es in keinem der beiden Tools gibt.
- Jedes Kind bekommt einen **Benutzernamen** (z. B. `Baum34`, nie doppelt vergeben) und ein **Bilder-Passwort** aus 3 Bildern – genau wie bei Vokaboom.
- **Reihen**: kleines oder grosses Einmaleins, welche Reihen und Aufgabenarten die Klasse übt und wie viele Rechnungen eine Runde hat. Diese Einstellungen sind Teil der Klasse; dafür muss das SQL-Skript nicht nochmals ausgeführt werden.
- **Kärtchen**: als PDF herunterladen (10 pro A4-Seite), ausdrucken, ausschneiden. Die Kärtchen haben kein Logo und sind in Einmaleins und Vokaboom gleich. Kinder, die in beiden Tools sind, bekommen zwei QR-Codes („ABC Vokabeln“ für Vokaboom, „1×1 Rechnen“ für Einmaleins). Ältere Vokaboom-Kärtchen gelten weiterhin.
- **Kind anmelden**: QR-Code auf dem Kärtchen scannen – oder **Anmelden → Ich bin ein Kind**, Benutzernamen eintippen und die 3 Bilder der Reihe nach antippen. Nach 8 falschen Versuchen ist 5 Minuten Pause. Auf einem Gerät, auf dem eine Lehrperson angemeldet ist, geht das Kinder-Login erst nach dem Abmelden.
- **Kärtchen verloren?** Beim Kind auf das Symbol mit den gekreuzten Pfeilen tippen: Es bekommt neue Bilder, das alte Kärtchen gilt nicht mehr.

## Gemeinsam angemeldet mit Vokaboom

Laufen Vokaboom und Einmaleins beide unter fabulousteaching.ch (`vokaboom.fabulousteaching.ch` und `einmaleins.fabulousteaching.ch`), teilen sie sich die Anmeldung über Cookies dieser Domain: Wer in einem Tool angemeldet ist (Lehrperson oder Kind), ist es auf demselben Gerät auch im anderen; Abmelden gilt für beide. Dafür muss Einmaleins die eigene Adresse haben (siehe README, „Online stellen“). Kinder können ausserdem mit dem Knopf „ABC Vokabeln üben“ / „1×1 Rechnen üben“ direkt angemeldet ins andere Tool wechseln.

## Was gespeichert wird

- Von Lehrpersonen: die E-Mail-Adresse (für die Anmeldung), die Klassen mit ihren Einstellungen.
- Von Kindern: Vorname, erster Buchstabe des Nachnamens, Benutzername, Bilder-Passwort und der Übungsstand (pro Rechnung: wie oft geübt, wie oft falsch, Zeit, die letzten falschen Antworten; Übungstage; Bestleistungen in den Spielen; Münzen). Keine E-Mail-Adressen.
- Ohne Anmeldung bleibt alles im Browser des Geräts.
- Gemeinsames Anmelden: Die Sitzung der Lehrperson und der Anmelde-Schlüssel eines Kindes liegen in Cookies der Domain fabulousteaching.ch (nur für Vokaboom und Einmaleins, keine Werbung oder Statistik).
- Die Zugriffsregeln sorgen dafür, dass jede Lehrperson nur ihre eigenen Klassen und Kinder sieht. Kinder können nur ihren eigenen Übungsstand lesen und speichern.

Kläre mit deiner Schule, ob das so erlaubt ist.

## Gut zu wissen

- **Pause bei Gratis-Projekten:** Supabase pausiert Gratis-Projekte nach etwa 7 Tagen ohne Nutzung (das gilt für Vokaboom und Einmaleins gemeinsam). Beim Projekt in Supabase **Restore** klicken. Während der Pause meldet Einmaleins «Keine Verbindung zum Server»; Üben geht trotzdem, der Stand wird später gemeldet.
- **Passwort vergessen:** wie bei Vokaboom (siehe dort `supabase/ANLEITUNG.md`), es ist dasselbe Konto.
- Ein Kind, eine Klasse oder alle Daten lassen sich auch direkt in Supabase unter **Table Editor** (Tabellen `einmaleins_…`) ansehen oder löschen. Wird eine Klasse gelöscht, sind auch ihre Kinder und deren Übungsstand weg.
