// CCU.IO Heizungssteuerung
// 1'2015 Sven Giermann
//
//   Derzeit reine Vorlauf-Temperatursteuerung nach Tageszeit/Wochentag
//
// Feiertage werden berücksichtigt!
// - bei Feiertag vor einem Samstag/Sonntag wird das Samstagsprogramm gewählt
// - bei Feiertag vor einem normalen Wochentag wird das Sonntagsprogramm gewählt
// - ein Sonntag vor einem Feiertag wird auch wie ein Samstag behandelt!
//
//
// TODO:
// - manuelles Setzen des Relais (Brauchwasser) führt nicht zu BW-Ladung, weil SollTemp = 0!
//   --> als einmaliges Override implementieren
//   --> dazu Betrieb solange aufrecht erhalten, bis einmal Abschalttemp. erreicht!
// - im Gegenzug führt Ausschalten des Relais auch nicht zur Reduktion des Kessel-Soll! (subscribe relaisId!)
//
// - "dynamisches" Kessel-Soll nach Ist-Temperatur setzen? (evtl. nicht Hysterese, sondern min/max getrennt setzen?)
//
// - Anlaufphase (soll = null) funktioniert noch nicht vernünftig! (setzt kein KesselSoll)
//
// - Ist-Temperatur-Datenpunkte und "Feiertag Heute/Morgen" nach Namen statt ID angeben?!
// - bei Heizkreisen/Mischerkreisen mehr als nur Hysterese setzen?!
// - nextSoll & nextZeit setzen
//

/*

0 = firstId:	".Soll"		Soll-Temperatur
1 = statusCnt:	".Count"	Zähler der Einschaltvorgänge (wenn externId angegeben, wird diese überwacht)
2 = statusTime:	".Zeit"		Betriebsstundenzähler in Stunden
3 = storage	".Vorrat"	Heizöl/Rohstoff-Vorrat, wenn "verbrauchStd" angegeben
x = nextSoll			(Kessel kaum möglich)
x = nextZeit			(Kessel kaum möglich)

*/

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Konfiguration
//
var debugLogLevel = 3;
var feierTagFirstId = 300000;

var Kessel = {
    "firstId":77000,		// hier erste ID für neu erstellte Datenpunkte einstellen. Es werden pro Kreis ... IDs reserviert (Bedeutung s.o.)
    "istTempId":74306,		// vorhandener Datenpunkt mit Ist-Temperatur
    "relaisId":77100,		// vorhandener Datenpunkt für Relais der Brenneranforderung
    "statusId":77101,		// vorhandener Datenpunkt für Zählung der Brennerbetriebszeit/Anschaltzyklen (notfalls =relaisId)
    "verbrauchStd":0.0205,	// Heizöl/Rohstoff-Verbrauch pro Betriebsstunde (hier in Hektoliter, dadurch bessere Anzeige)
    "hysterese":10,
    "minTemp":40,
    "maxTemp":75
}
var Heizkreise = {
    "Brauchwasser":{
        "kesselPlus":15,	// wieviel Kelvin muss Kessel mehr als Soll haben
        "notlauf":55,		// Fallback, wenn (noch) keine Uhrzeit verfügbar ist
        "istTempId":74308,	// vorhandener Datenpunkt mit Ist-Temperatur
        "relaisId":77102,	// vorhandener Datenpunkt für Relais der Ladepumpe
        "hysterese":5,
        "mo-fr":{		// benannte Zeitprogramme
            "0500":55,
            "0900":0,
            "1200":55,
            "2130":0
        },
        "wochenende":{
            "0500":55,
            "2130":0
        },
        "tagesprogramm":{	// Wochentagsprogramme
            1:"mo-fr",
            2:"mo-fr",
            3:"mo-fr",
            4:"mo-fr",
            5:"mo-fr",
            6:"wochenende",
            0:"wochenende"
        }
    },
    "Fussboden":{
        "kesselPlus":-20,
        "notlauf":40,
        "istTempId":74303,
        "relaisId":77103,
        "hysterese":3,
        "programm":{
            "0530":40,
            "0900":20,
            "1200":40,
            "2000":20
        }
    },
    "Heizkreis":{
        "kesselPlus":-15,
        "notlauf":50,
        "istTempId":74305,
        "relaisId":77104,
        "hysterese":3,
        "programm":{
            "0600":50,
            "2200":30
        }
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Hilfsfunktionen
//

function logOutput(level, str) {
//        "1": "debug  ",
//        "2": "verbose",
//        "3": "info   ",
//        "4": "warn   ",
//        "5": "error  "
    if (level >= debugLogLevel) log(str);
}

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Überwachung/Auslesen eines externen Zustandes (An-Überwachung mittels externem Programm)
//
function observeStatus(data, idCnt, idTime, usage, idRest) {
    if (data.newState.value == data.oldState.value) return;

    logOutput(1, "[observeStatus] #" + data.id + " --> " + data.newState.value);

    // zählen von undefinierten Zuständen verhindern
    if ((data.oldState.value != null) && (data.oldState.value >= 0)) {
        if ((data.newState.value == true) || (data.newState.value > 0)) {
            // Einschaltvorgang
            var cntOld = parseInt(getState(idCnt));
            setState(idCnt, cntOld + 1);
            logOutput(2, "[observeStatus] increase counter #" + idCnt + " --> " + cntOld + " + 1");
        } else if ((data.newState.value == false) || (data.newState.value == 0)) {
            // Ausschaltvorgang
            var timeOld = parseFloat(getState(idTime));
            var duration = Date.parse(data.newState.timestamp) - Date.parse(data.oldState.lastchange);
            setState(idTime, timeOld + (duration / 3600000));
            logOutput(2, "[observeStatus] add time #" + idTime + " --> " + timeOld + " + " + duration + "ms");

            if ((usage != null) && (idRest != null)) {
                var storeOld = parseFloat(getState(idRest));
                setState(idRest, storeOld - (usage * duration / 3600000));
                logOutput(2, "[observeStatus] consumed " + (usage * duration / 3600000) + " of " + storeOld + " at #" + idRest);
            }
        }
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Überwachung/Regulierung der Soll-Temperaturen
//
// TODO: Bisher reine Speicherladung mittels Pumpe, noch KEIN Pumpenkreis, noch KEIN Mischerkreis
//
function observeTemp(data, kreis) {
    var minTemp, maxTemp, istTemp, hysterese = 10;

    if (kreis["hysterese"]) hysterese = kreis["hysterese"];
    if (kreis["istTempId"]) {
        istTemp = getState(kreis["istTempId"]);
        minTemp = getState(kreis["firstId"]) - hysterese/2;
        maxTemp = minTemp + hysterese;
        if (kreis["minTemp"] && (kreis["minTemp"] > minTemp)) minTemp = kreis["minTemp"];
        if (kreis["maxTemp"] && (kreis["maxTemp"] < maxTemp)) maxTemp = kreis["maxTemp"];
    }

    if (!istTemp) {
        logOutput(4, "[observeTemp] cannot read temperature for circuit #" + kreis["firstId"] + " on change of #" + data.id);
    } else if (kreis["relaisId"]) {
        var istRelais = getState(kreis["relaisId"]);
        if ((istRelais != true) && (istTemp < minTemp)) {
            logOutput(2, "[observeTemp] set relais #" + kreis["relaisId"] + " ON (temp " + istTemp + " < " + minTemp + ")");
            setState(kreis["relaisId"], true);
        } else if ((istRelais != false) && (istTemp > maxTemp)) {
            logOutput(2, "[observeTemp] set relais #" + kreis["relaisId"] + " OFF (temp " + istTemp + " > " + maxTemp + ")");
            setState(kreis["relaisId"], false);
        } else {
            logOutput(1, "[observeTemp] leave relais #" + kreis["relaisId"] + (istRelais ? " ON" : " OFF") + " (temp " + istTemp + " is " + minTemp + ".." + maxTemp + ")");
        }
    }
}

function observeRelay(data, kreis) {
    var sollTemp = getState(kreis["firstId"]);

    // beim Einschalten des Relais, prüfen ob Kessel-Soll erhöht werden muss
    if (data.newState.value && (sollTemp > 0)) {
        kreis["kesselAnf"] = sollTemp + (kreis["kesselPlus"] ? kreis["kesselPlus"] : 10);
        if (kreis["kesselAnf"] > getState(Kessel["firstId"]))
            setState(Kessel["firstId"], kreis["kesselAnf"]);
        logOutput(2, "[observeRelay] set demand for ciruit #" + kreis["firstId"] + " to " + sollTemp + "°C");
    } else {
        kreis["kesselAnf"] = 0;

        // frage Maximum aller anderen Heizkreise ab, starte mit Kessel-Mindesttemperatur
        sollTemp = (Kessel["minTemp"] ? Kessel["minTemp"] : 40);
        for (var HK in Heizkreise) {
            sollTemp = Heizkreise[HK]["kesselAnf"];
            if (sollTemp < Heizkreise[HK]["kesselAnf"]) sollTemp = Heizkreise[HK]["kesselAnf"];
        }
        setState(Kessel["firstId"], sollTemp);
        logOutput(2, "[observeRelay] unset demand for ciruit #" + kreis["firstId"] + ", reset to " + sollTemp + "°C");
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Zeitplanung der Soll-Temperaturen
//
function getNominalTemp(kreis, zeit, wochentag) {
    var soll = -1;
    var zsoll = "0000";
    var programm, progGestern;

    if (kreis["tagesprogramm"]) {
        logOutput(2, "[getNominalTemp] read program for day " + wochentag);
        if (kreis["tagesprogramm"][wochentag])
            programm = kreis[kreis["tagesprogramm"][wochentag]];
    }
    if (!programm) {
        // wenn keine Sektion "tagesprogramm" gefunden, dann für alle Tage "programm" nutzen
        programm = kreis["programm"];
        if (programm)
            logOutput(2, "[getNominalTemp] read global program");
        else
            logOutput(4, "[getNominalTemp] no program found!");
    }

    if (programm) for (var zprog in programm) {
        if ((zsoll <= zprog) && (zeit >= zprog)) {
            soll = programm[zprog];
            zsoll = zprog;
            logOutput(1, "[getNominalTemp] use '" + zprog + "' temp " + soll + "°C");
        } else
            logOutput(1, "[getNominalTemp] skip '" + zprog + "'");
    }

    return soll;
}

function setNominalTemp() {
    var sollTemp, now = new Date();
    var timeNow = ("0" + now.getHours()).slice(-2) + ("0" + now.getMinutes()).slice(-2);
    var heute = now.getDay();

    // Feiertagslogik
    if (getState(feierTagFirstId)) heute = 0;				// "Feiertag Heute" = Sonntag
    if ((heute == 0) && getState(feierTagFirstId + 2)) heute = 6;	// Sonntag/Feiertag + "Feiertag Morgen" = Samstag
    if ((heute == 0) && (now.getDay > 4)) heute = 6;			// Feiertag vor einem Wochenende = Samstag

    // alle Heizkreise durchlaufen
    for (var HK in Heizkreise) {
        // Soll-Temperatur nach Zeitplan nur bestimmen, wenn Datum/Uhrzeit stimmt; sonst Notlauf-Temperatur belassen
        if (now.getFullYear() < 2000) {
            sollTemp = Heizkreise[HK]["notlauf"];
        } else {
            sollTemp = getNominalTemp(Heizkreise[HK], timeNow, heute);

            // wenn keine gefunden: zuletzt gesetzte Soll-Temperatur auslesen
            if (sollTemp < 0) {
                sollTemp = getState(Heizkreise[HK]["firstId"]);
                // ist diese unbrauchbar, letzte Soll-Temperatur des Vortages ermitteln
                // HINWEIS: hier erfolgt keine Prüfung, ob gestern ein Feiertag war - sollte aber recht selten eintreten
                if (!sollTemp) sollTemp = getNominalTemp(Heizkreise[HK], "2400", (now.getDay() + 6) % 7);
            }
        }
        if (sollTemp >= 0) {
            logOutput(2, "[setNominalTemp] set temp [" + timeNow + "] to " + sollTemp + "°C");
            setState(Heizkreise[HK]["firstId"], sollTemp);
        }
    }

    // TODO: bei minütlicher Ausführung nicht mehr erforderlich!
    if (now.getFullYear() < 2000) {
        // Zeit nach Reboot noch nicht gestellt, alle 30 Sekunden prüfen
        setTimeout(setNominalTemp, 30000);
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Initialisierung(en)
//
function initDatapoints(name, kreis) {
    setObject(kreis["firstId"], {
        Name: "Heizung." + name + ".Soll",
        TypeName: "VARDP",
        ValueUnit: "°C",
        _persistent: true
    });
    logOutput(3, "[initDatapoints] created datapoint #" + kreis["firstId"] + " 'Heizung." + name + ".Soll'");

    // Betriebsstundenzähler
    if (kreis["statusId"]) {
        kreis["statusCnt"] = kreis["firstId"] + 1;
        setObject(kreis["statusCnt"], {
            Name: "Heizung." + name + ".Cnt",
            TypeName: "VARDP",
            _persistent: true
        });
        logOutput(3, "[initDatapoints] created datapoint #" + kreis["statusCnt"] + " 'Heizung." + name + ".Cnt'");

        kreis["statusTime"] = kreis["firstId"] + 2;
        setObject(kreis["statusTime"], {
            Name: "Heizung." + name + ".Zeit",
            TypeName: "VARDP",
            _persistent: true
        });
        logOutput(3, "[initDatapoints] created datapoint #" + kreis["statusTime"] + " 'Heizung." + name + ".Zeit'");

        if (kreis["verbrauchStd"]) {
            kreis["storage"] = kreis["firstId"] + 3;
            setObject(kreis["storage"], {
                Name: "Heizung." + name + ".Vorrat",
                TypeName: "VARDP",
                _persistent: true
            });
            logOutput(3, "[initDatapoints] created datapoint #" + kreis["storage"] + " 'Heizung." + name + ".Vorrat'");
        } else {
            kreis["storage"] = null;
        }

        subscribe({
            id: kreis["statusId"]
        }, function(data) {
            observeStatus(data, kreis["statusCnt"], kreis["statusTime"], kreis["verbrauchStd"], kreis["storage"]);
        });
    }

    if (kreis["istTempId"]) {
        // wenn Ist-Temperatur vorhanden, dann Soll- und Ist-Temperatur überwachen
        subscribe({
            id: kreis["firstId"]
        }, function(data) {
            observeTemp(data, kreis);
        });

        subscribe({
            id: kreis["istTempId"]
        }, function(data) {
            observeTemp(data, kreis);
        });
    }

//    if (kreis["relaisId"]) {
        // Anfangszustand auf null (undefiniert) setzen
        // nur dadurch wird nach einem Neustart des Systems auch der Relaiszustand wieder gesetzt!
//        setState(kreis["relaisId"], null);
//    }
}

function initHeizung() {
    if (!Kessel["firstId"]) {
        logOutput(5, "[initHeizung] Configuration error - exiting.");
        return;
    }
    // Datenpunkte erstellen und auf Notlauftemperatur stellen
    initDatapoints("Kessel", Kessel);

    // Datenpunkte der Heizkreise setzen
    var cnt = 1;
    for (var HK in Heizkreise) {
        Heizkreise[HK]["firstId"] = Kessel["firstId"] + (10 * cnt++);
        initDatapoints(HK, Heizkreise[HK]);

        // Relaiszustand überwachen
        if (Heizkreise[HK]["relaisId"]) {
            subscribe({
                id: Heizkreise[HK]["relaisId"]
            }, function(data) {
                observeRelais(data, Heizkreise[HK]);
            });
        }
        // TODO: nextSoll / nextZeit nur bei Heizkreisen
    }

    // einmalig Temperaturen setzen, fortan alle 5 Minuten
    setNominalTemp();
    schedule("0/5 * * * *", setNominalTemp);
}


initHeizung();
