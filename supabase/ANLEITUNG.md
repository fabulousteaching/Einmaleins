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

- `https://fabulousteaching.github.io/Einmaleins/**`
- und, falls eingerichtet, `https://einmaleins.fabulousteaching.ch/**`

Die **Site URL** bleibt die von Vokaboom. Dorthin bzw. zu Einmaleins führen die Links in E-Mails (Konto bestätigen, Passwort vergessen). Ohne diesen Eintrag landen solche Links auf Vokaboom; das Anmelden mit E-Mail und Passwort funktioniert aber trotzdem.

Fertig. Oben rechts **Anmelden → Ich bin Lehrperson**.

## Klassen und Kinder-Logins

- **Klasse anlegen**, dann **Kinder** eintragen (Vorname und erster Buchstabe des Nachnamens, einzeln oder als Liste). Gespeichert wird nur der Vorname und der erste Buchstabe des Nachnamens.
- **Aus Vokaboom übernehmen** (auf der Seite „Meine Klassen“ oder im Bereich „Kinder“ einer Klasse): Die Kinder einer Vokaboom-Klasse kommen mit **ihrem Vokaboom-Benutzernamen und ihren 3 Bildern** nach Einmaleins – ein Kärtchen für beide Tools. Es gelten immer die aktuellen Bilder aus Vokaboom; „Neue Bilder“ in Einmaleins ändert sie auch in Vokaboom. Neue Kinder in der Vokaboom-Klasse holt „Mit Vokaboom abgleichen“ nach. Kinder, die schon übernommen sind, kommen nicht doppelt. Vokaboom selbst wird nur gelesen; Kinder, die in Einmaleins gelöscht werden, bleiben in Vokaboom.
- Neue Kinder, die du direkt in Einmaleins anlegst, bekommen einen Benutzernamen, den es auch in Vokaboom nicht gibt.
- Jedes Kind bekommt einen **Benutzernamen** (z. B. `Baum34`, nie doppelt vergeben) und ein **Bilder-Passwort** aus 3 Bildern – genau wie bei Vokaboom.
- **Reihen**: welche Reihen und Aufgabenarten die Klasse übt.
- **Kärtchen**: als PDF herunterladen (10 pro A4-Seite), ausdrucken, ausschneiden. Die Kärtchen haben kein Logo. Kinder mit Vokaboom-Login bekommen zwei QR-Codes („ABC Vokabeln“ für Vokaboom, „1×1 Rechnen“ für Einmaleins). Ihre bisherigen Vokaboom-Kärtchen gelten weiterhin (Benutzername eintippen und Bilder antippen; der QR-Code darauf öffnet Vokaboom).
- **Kind anmelden**: QR-Code auf dem Kärtchen scannen – oder **Anmelden → Ich bin ein Kind**, Benutzernamen eintippen und die 3 Bilder der Reihe nach antippen. Nach 8 falschen Versuchen ist 5 Minuten Pause. Auf einem Gerät, auf dem eine Lehrperson angemeldet ist, geht das Kinder-Login erst nach dem Abmelden.
- **Kärtchen verloren?** Beim Kind auf das Symbol mit den gekreuzten Pfeilen tippen: Es bekommt neue Bilder, das alte Kärtchen gilt nicht mehr.

## Was gespeichert wird

- Von Lehrpersonen: die E-Mail-Adresse (für die Anmeldung), die Klassen mit ihren Einstellungen.
- Von Kindern: Vorname, erster Buchstabe des Nachnamens, Benutzername, Bilder-Passwort und der Übungsstand (pro Rechnung: wie oft geübt, wie oft falsch, Zeit, die letzten falschen Antworten; Übungstage; Bestleistungen in den Spielen). Keine E-Mail-Adressen.
- Ohne Anmeldung bleibt alles im Browser des Geräts.
- Die Zugriffsregeln sorgen dafür, dass jede Lehrperson nur ihre eigenen Klassen und Kinder sieht. Kinder können nur ihren eigenen Übungsstand lesen und speichern.

Kläre mit deiner Schule, ob das so erlaubt ist.

## Gut zu wissen

- **Pause bei Gratis-Projekten:** Supabase pausiert Gratis-Projekte nach etwa 7 Tagen ohne Nutzung (das gilt für Vokaboom und Einmaleins gemeinsam). Beim Projekt in Supabase **Restore** klicken. Während der Pause meldet Einmaleins «Keine Verbindung zum Server»; Üben geht trotzdem, der Stand wird später gemeldet.
- **Passwort vergessen:** wie bei Vokaboom (siehe dort `supabase/ANLEITUNG.md`), es ist dasselbe Konto.
- Ein Kind, eine Klasse oder alle Daten lassen sich auch direkt in Supabase unter **Table Editor** (Tabellen `einmaleins_…`) ansehen oder löschen. Wird eine Klasse gelöscht, sind auch ihre Kinder und deren Übungsstand weg.
