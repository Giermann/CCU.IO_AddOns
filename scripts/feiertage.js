// CCU.IO Feiertags-Script
// 3'2014 hobbyquaker
// 3'2015 Giermann - Umstellung auf Berechnung der Feiertage

// Hier Bundesland einstellen.
// Liste der Abkürzungen siehe http://hobbyquaker.blogspot.de/2014/03/deutsche-feiertage-im-json-format.html
//   BB | BE | BW | BY | HB | HE | HH | MV | NI | NW | RP | SH | SL | SN | ST | TH
var state = "BW";

// bei Bedarf hier Kommando zum Einstellen der Uhrzeit angeben
var ntpCommand = "sudo /usr/sbin/ntpdate-debian";

// Hier ggf erste ID einstellen. Es werden 8 IDs benötigt.
var firstId = 300000;

// Variablen anlegen
setObject(firstId, {
    Name: "Feiertag Heute",
    TypeName: "VARDP",
    _persistent: true
});

setObject(firstId + 1, {
    Name: "Feiertag Heute Name",
    TypeName: "VARDP",
    _persistent: true
});

setObject(firstId + 2, {
    Name: "Feiertag Morgen",
    TypeName: "VARDP",
    _persistent: true
});

setObject(firstId + 3, {
    Name: "Feiertag Morgen Name",
    TypeName: "VARDP",
    _persistent: true
});

setObject(firstId + 4, {
    Name: "Feiertag Übermorgen",
    TypeName: "VARDP",
    _persistent: true
});

setObject(firstId + 5, {
    Name: "Feiertag Übermorgen Name",
    TypeName: "VARDP",
    _persistent: true
});

setObject(firstId + 6, {
    Name: "Feiertag nächster Datum",
    TypeName: "VARDP",
    _persistent: true
});

setObject(firstId + 7, {
    Name: "Feiertag nächster Name",
    TypeName: "VARDP",
    _persistent: true
});


//
// OsterSonntagWert() - liefert den Tag des Ostersonntag im März zurück (oder im April, wenn > 31)
//
// source: http://www.dzone.com/snippets/feiertage-berechnen-calculate
//         http://www.dagmar-mueller.de/wdz/html/feiertagsberechnung.html
//
function OsterSonntagWert(year) {
    var jh, a, b, c, s, M, N, D, e;

    jh = Math.floor(year / 100);
    a = year % 19;
    b = year % 4;
    c = year % 7;

    s = jh - Math.floor(year / 400) - 2;
    M = Math.floor(((8 * jh) + 13) / 25) - 2;
    M = (15 + s - M) % 30;
    N = (6 + s) % 7;

    D = ((19 * a) + M) % 30;
    if (D == 29) {
        // D = 28 falls d = 29
        D = 28;
    } else if ((D == 28) && (a > 10)) {
        // 27 falls d = 28 und a >= 11
        D = 27;
    }

    e = ((2 * b) + (4 * c) + (6 * D) + N) % 7;

    return 22 + D + e;
}

// gibt das Datum als String zurück (Date Objekt nutzen, um Überlauf bei Tageszahl umzurechnen)
function dateStr(year, month, day) {
    var d = new Date(year, month - 1, day);
    return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
}


// erzeugt ein (Objekt)Array aller Feiertage dieses und des nächsten Jahres
function allHolidays(state) {
    var holidayArr = {};
    var year, os;

    for (var i=0; i<2; i++) {
        year = (new Date()).getFullYear() + i;
        os = OsterSonntagWert(year);

        holidayArr[dateStr(  year, 01, 01)]    = "Neujahr";
        if (state == "BW" ||
            state == "BY" ||
            state == "ST")
          holidayArr[dateStr(year, 01, 06)]    = "Heilige Drei Könige";
        holidayArr[dateStr(  year, 03, os-2)]  = "Karfreitag";
        holidayArr[dateStr(  year, 03, os  )]  = "Ostersonntag";
        holidayArr[dateStr(  year, 03, os+1)]  = "Ostermontag";
        holidayArr[dateStr(  year, 05, 01)]    = "1. Mai";
        holidayArr[dateStr(  year, 03, os+39)] = "Christi Himmelfahrt";
        holidayArr[dateStr(  year, 03, os+49)] = "Pfingstsonntag";
        holidayArr[dateStr(  year, 03, os+50)] = "Pfingstmontag";
        if (state == "BW" ||
            state == "BY" ||
            state == "HE" ||
            state == "NW" ||
            state == "RP" ||
            state == "SL")
          holidayArr[dateStr(year, 03, os+60)] = "Fronleichnam";
        if (state == "BY" ||
            state == "SL")
          holidayArr[dateStr(year, 08, 15)]    = "Mariä Himmelfahrt";
        holidayArr[dateStr(  year, 10, 03)]    = "Tag der deutschen Einheit";
        if (state == "BB" ||
            state == "MV" ||
            state == "SN" ||
            state == "ST" ||
            state == "TH")
          holidayArr[dateStr(year, 10, 31)]    = "Reformationstag";
        if (state == "BW" ||
            state == "BY" ||
            state == "NW" ||
            state == "RP" ||
            state == "SL")
          holidayArr[dateStr(year, 11, 01)]    = "Allerheiligen";
        if (state == "SN")
          holidayArr[dateStr(year, 11, 22 - (new Date(year, 11, 24)).getDay())] = "Buß und Bettag";
//          holidayArr[dateStr(year, 11, 22 - (61 - os) % 7)] = "Buß und Bettag";
        holidayArr[dateStr(  year, 12, 25)]    = "Erster Weihnachtsfeiertag";
        holidayArr[dateStr(  year, 12, 26)]    = "Zweiter Weihnachtsfeiertag";
    }

    return holidayArr;
}

function checkHolidays() {
    var d0 = new Date();
    var ts0 = dateStr(d0.getFullYear(), d0.getMonth() + 1, d0.getDate());
    var ts1 = dateStr(d0.getFullYear(), d0.getMonth() + 1, d0.getDate() + 1);
    var ts2 = dateStr(d0.getFullYear(), d0.getMonth() + 1, d0.getDate() + 2);

    var holiday0 = false;
    var holiday1 = false;
    var holiday2 = false;

    var holiday0name = "";
    var holiday1name = "";
    var holiday2name = "";

    var holidayNextDate = "";
    var holidayNextName = "";

    var holidays = allHolidays(state);

    if (holidays[ts0]) {
        holiday0 = true;
        holiday0name = holidays[ts0];
    }

    if (holidays[ts1]) {
        holiday1 = true;
        holiday1name = holidays[ts1];
    }

    if (holidays[ts2]) {
        holiday2 = true;
        holiday2name = holidays[ts2];
    }

    for (var ts in holidays) {
        if (ts > ts0) {
            holidayNextDate = ts.substr(0,4)+"-"+ts.substr(4,2)+"-"+ts.substr(6,2);
            holidayNextName = holidays[ts];
            break;
        }
    }

    setState(firstId, holiday0);
    setState(firstId+1, holiday0name);
    setState(firstId+2, holiday1);
    setState(firstId+3, holiday1name);
    setState(firstId+4, holiday2);
    setState(firstId+5, holiday2name);
    setState(firstId+6, holidayNextDate);
    setState(firstId+7, holidayNextName);

    // anschließend bei Bedarf die Uhrzeit synchronisieren
    if (ntpCommand && ntpCommand != "") {
        var cp = require('child_process');
        cp.exec(ntpCommand+" 2>&1", function(err, stdout) {
            if(stdout) log(stdout);
        });
    }
}

// Einmal bei Scriptstart ausführen
checkHolidays();

// Täglich um 0 Uhr ausführen
schedule("0 0 * * *", checkHolidays);


