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
// - bei einmaligem Override: Betrieb solange aufrecht erhalten, bis einmal Abschalttemp. erreicht!
// - im Gegenzug führt Ausschalten des Relais auch nicht zur Reduktion des Kessel-Soll! (subscribe relaisId!)
//
// - "dynamisches" Kessel-Soll nach Ist-Temperatur setzen? (evtl. nicht Hysterese, sondern min/max getrennt setzen?)
// - Kessel-Notruf einführen, Verbraucher bei drohender Überhitzung einschalten!
//
// - Anlaufphase (soll = null) funktioniert noch nicht vernünftig! (setzt kein KesselSoll) ?
//
// - Ist-Temperatur-Datenpunkte und "Feiertag Heute/Morgen" nach Namen statt ID angeben?!
// - bei Heizkreisen/Mischerkreisen mehr als nur Hysterese setzen?!
// - nextSoll & nextZeit setzen
//

/*

0 = firstId:              Channel Id
1 = countId:   ".Count"   Zähler der Einschaltvorgänge (wenn externId angegeben, wird diese überwacht)
2 = timeId:    ".Zeit"    Betriebsstundenzähler in Stunden
3 = storageId: ".Vorrat"  Heizöl/Rohstoff-Vorrat, wenn "usage" angegeben
4 = nomTempId: ".Soll"    Soll-Temperatur
x = nextSoll              (Kessel kaum möglich)
x = nextZeit              (Kessel kaum möglich)

*/

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Konfiguration
//
var debugLogLevel = 3;
var feierTagFirstId = 300000;

var Kessel = {
    firstId:   77000,  // hier erste ID für neu erstellte Datenpunkte einstellen. Es werden pro Kreis ... IDs reserviert (Bedeutung s.o.)
    istTempId: 74306,  // vorhandener Datenpunkt mit Ist-Temperatur
    relaisId:  77101,  // vorhandener Datenpunkt für Relais der Brenneranforderung
    statusId:  77107,  // vorhandener Datenpunkt für Zählung der Brennerbetriebszeit/Anschaltzyklen (notfalls =relaisId)
    usage:     0.0205, // Heizöl/Rohstoff-Verbrauch pro Betriebsstunde (hier in Hektoliter, dadurch bessere Anzeige)
    hysterese: 10,
    minTemp:   40,
    maxTemp:   75
}
var Heizkreise = {
    "Brauchwasser":{
        kesselPlus: 15,    // wieviel Kelvin muss Kessel mehr als Soll haben
        notlauf:    52,    // Fallback, wenn (noch) keine Uhrzeit verfügbar ist
        istTempId:  74308, // vorhandener Datenpunkt mit Ist-Temperatur
        relaisId:   77102, // vorhandener Datenpunkt für Relais der Ladepumpe
        hysterese:  10,
        "_1":{             // benannte Zeitprogramme
            "0500":52,
            "0900":0,
            "1200":52,
            "2130":0
        },
        "_2":{
            "0500":52,
            "2130":0
        },
        dayprogram:{       // Wochentagsprogramme
            1:"_1",
            2:"_1",
            3:"_1",
            4:"_1",
            5:"_1",
            6:"_2",
            0:"_2"
        }
    },
    "Fussboden":{
        kesselPlus: -20,
        notlauf:    21.5,
        istTempId:  74303,
        relaisId:   77103,
        mischerId:  77105,
        hysterese:  3,
        "_1":{             // benannte Zeitprogramme
            "0530":22.5,
            "0900":19.5,
            "1200":22.5,
            "2000":19.5
        },
        "_2":{
            "0530":22.5,
            "0900":19.5,
            "1200":22.5,
            "2100":19.5
        },
        "_3":{
            "0530":22.5,
            "2100":19.5
        },
        "_4":{
            "0530":22.5,
            "2000":19.5
        },
        dayprogram:{       // Wochentagsprogramme
            1:"_1",
            2:"_1",
            3:"_1",
            4:"_1",
            5:"_2",
            6:"_3",
            0:"_4"
        }
    },
    "Heizkreis":{
        kesselPlus: -15,
        notlauf:    23.5,
        istTempId:  74305,
        relaisId:   77104,
        mischerId:  77106,
        hysterese:  3,
//        program:{
//            "0530":50,
//            "2200":30
//        }
        "_1":{             // benannte Zeitprogramme
            "0530":23.5,
            "0900":17.5,
            "1200":23.5,
            "2200":17.5
        },
        "_2":{
            "0700":23.5,
            "2200":17.5
        },
        dayprogram:{       // Wochentagsprogramme
            1:"_1",
            2:"_1",
            3:"_1",
            4:"_1",
            5:"_1",
            6:"_2",
            0:"_2"
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
// use:
//   observeStatus.bind( Heizkreise[...] );
//
function observeStatus(data) {
    if (data.newState.value == data.oldState.value) return;

    logOutput(1, "[observeStatus] #" + data.id + " --> " + data.newState.value);

    // zählen von undefinierten Zuständen verhindern
    if ((data.oldState.value != null) && (data.oldState.value >= 0)) {
        if ((data.newState.value == true) || (data.newState.value > 0)) {
            // Einschaltvorgang
            var cntOld = parseInt(getState(this.countId));
            setState(this.countId, cntOld + 1);
            logOutput(2, "[observeStatus] increase counter #" + this.countId + " --> " + cntOld + " + 1");
        } else if ((data.newState.value == false) || (data.newState.value == 0)) {
            // Ausschaltvorgang
            var timeOld = parseFloat(getState(this.timeId));
            var duration = Date.parse(data.newState.timestamp) - Date.parse(data.oldState.lastchange);
            setState(this.timeId, timeOld + (duration / 3600000));
            logOutput(2, "[observeStatus] add time #" + this.timeId + " --> " + timeOld + " + " + duration + "ms");

            if (this.usage && this.storageId) {
                var storeOld = parseFloat(getState(this.storageId));
                setState(this.storageId, storeOld - (this.usage * duration / 3600000));
                logOutput(2, "[observeStatus] consumed " + (this.usage * duration / 3600000) + " of " + storeOld + " at #" + this.storageId);
            }
        }
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Überwachung/Regulierung der Soll-Temperaturen und Relaiszustände
//
// TODO: Bisher reine Speicherladung mittels Pumpe, noch KEIN Pumpenkreis, noch KEIN Mischerkreis
//
// use:
//   observeTemp.bind( Heizkreise[...] );
//   observeRelay.bind( Heizkreise[...] );
//
function observeTemp(data) {
    var minTemp, maxTemp, istTemp;

    if (this.istTempId) {
        istTemp = getState(this.istTempId);
        minTemp = getState(this.nomTempId) - (this.hysterese ? this.hysterese/2 : 5);
        maxTemp = minTemp + (this.hysterese ? this.hysterese : 10);
        if (this.minTemp && (this.minTemp > minTemp)) minTemp = this.minTemp;
        if (this.maxTemp && (this.maxTemp < maxTemp)) maxTemp = this.maxTemp;
    }

    if (!istTemp) {
        logOutput(4, "[observeTemp] cannot read temperature for circuit #" + this.nomTempId + " on change of #" + data.id);
    } else if (this.relaisId) {
        var istRelais = getState(this.relaisId);
        if ((istRelais != true) && (istTemp < minTemp)) {
            logOutput(2, "[observeTemp] set relais #" + this.relaisId + " ON (temp " + istTemp + " < " + minTemp + ")");
            setState(this.relaisId, true);
        } else if ((istRelais != false) && (istTemp > maxTemp)) {
            logOutput(2, "[observeTemp] set relais #" + this.relaisId + " OFF (temp " + istTemp + " > " + maxTemp + ")");
            setState(this.relaisId, false);
        } else {
            logOutput(1, "[observeTemp] leave relais #" + this.relaisId + (istRelais ? " ON" : " OFF") + " (temp " + istTemp + " is " + minTemp + ".." + maxTemp + ")");
        }
    }
}

function observeRelay(data) {
    var sollTemp = getState(this.nomTempId);

    // beim Einschalten des Relais, prüfen ob Kessel-Soll erhöht werden muss
    if (data.newState.value && (sollTemp > 0)) {
        this.kesselAnf = sollTemp + (this.kesselPlus ? this.kesselPlus : 10);
        if (this.kesselAnf > getState(Kessel.nomTempId))
            setState(Kessel.nomTempId, this.kesselAnf);
        logOutput(2, "[observeRelay] set demand for ciruit #" + this.nomTempId + " to " + sollTemp + "°C");
    } else {
        this.kesselAnf = 0;

        // frage Maximum aller anderen Heizkreise ab, starte mit Kessel-Mindesttemperatur
        sollTemp = (Kessel.minTemp ? Kessel.minTemp : 40);
        for (var HK in Heizkreise) {
            if (sollTemp < Heizkreise[HK].kesselAnf) sollTemp = Heizkreise[HK].kesselAnf;
        }
        setState(Kessel.nomTempId, sollTemp);
        logOutput(2, "[observeRelay] unset demand for ciruit #" + this.nomTempId + ", reset to " + sollTemp + "°C");
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Zeitplanung der Soll-Temperaturen
//
function getNominalTemp(kreis, zeit, wochentag) {
    var soll = -1;
    var zsoll = "0000";
    var prog;

    if (kreis.dayprogram) {
        logOutput(2, "[getNominalTemp] read program for day " + wochentag);
        if (kreis.dayprogram[wochentag])
            prog = kreis[kreis.dayprogram[wochentag]];
    }
    if (!prog) {
        // wenn keine Sektion "dayprogram" gefunden, dann für alle Tage "program" nutzen
        prog = kreis.program;
        if (program)
            logOutput(2, "[getNominalTemp] read global program");
        else
            logOutput(4, "[getNominalTemp] no program found!");
    }

    if (prog) for (var zprog in prog) {
        if ((zsoll <= zprog) && (zeit >= zprog)) {
            soll = prog[zprog];
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
            sollTemp = Heizkreise[HK].notlauf;
        } else {
            sollTemp = getNominalTemp(Heizkreise[HK], timeNow, heute);

            // wenn keine gefunden: zuletzt gesetzte Soll-Temperatur auslesen
            if (sollTemp < 0) {
                sollTemp = getState(Heizkreise[HK].nomTempId);
                // ist diese unbrauchbar, letzte Soll-Temperatur des Vortages ermitteln
                // HINWEIS: hier erfolgt keine Prüfung, ob gestern ein Feiertag war - sollte aber recht selten eintreten
                if (!sollTemp) sollTemp = getNominalTemp(Heizkreise[HK], "2400", (now.getDay() + 6) % 7);
            }
        }
        if (sollTemp >= 0) {
            logOutput(2, "[setNominalTemp] set temp [" + timeNow + "] to " + sollTemp + "°C");
            setState(Heizkreise[HK].nomTempId, sollTemp);
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
    kreis.nomTempId = kreis.firstId + 4;
    setObject(kreis.nomTempId, {
        Name: "Heizung." + name + ".Soll",
        TypeName: "VARDP",
        ValueUnit: "°C",
        _persistent: true
    });
    logOutput(3, "[initDatapoints] created datapoint #" + kreis.nomTempId + " 'Heizung." + name + ".Soll'");

    // Betriebsstundenzähler
    if (kreis.statusId) {
        kreis.countId = kreis.firstId + 1;
        setObject(kreis.countId, {
            Name: "Heizung." + name + ".Cnt",
            TypeName: "VARDP",
            _persistent: true
        });
        logOutput(3, "[initDatapoints] created datapoint #" + kreis.countId + " 'Heizung." + name + ".Cnt'");

        kreis.timeId = kreis.firstId + 2;
        setObject(kreis.timeId, {
            Name: "Heizung." + name + ".Zeit",
            TypeName: "VARDP",
            _persistent: true
        });
        logOutput(3, "[initDatapoints] created datapoint #" + kreis.timeId + " 'Heizung." + name + ".Zeit'");

        if (kreis.usage) {
            kreis.storageId = kreis.firstId + 3;
            setObject(kreis.storageId, {
                Name: "Heizung." + name + ".Vorrat",
                TypeName: "VARDP",
                _persistent: true
            });
            logOutput(3, "[initDatapoints] created datapoint #" + kreis.storageId + " 'Heizung." + name + ".Vorrat'");
        } else {
            kreis.storageId = null;
        }

        subscribe({
            id: kreis.statusId
        },
            observeStatus.bind( kreis )
        );
    }

    if (kreis.istTempId) {
        // wenn Ist-Temperatur vorhanden, dann Soll- und Ist-Temperatur überwachen
        subscribe({
            id: kreis.nomTempId
        },
            observeTemp.bind( kreis )
        );

        subscribe({
            id: kreis.istTempId
        },
            observeTemp.bind( kreis )
        );
    }
}

function initHeizung() {
    if (!Kessel.firstId) {
        logOutput(5, "[initHeizung] Configuration error - exiting.");
        return;
    }
    // Datenpunkte erstellen und auf Notlauftemperatur stellen
    initDatapoints("Kessel", Kessel);

    // Datenpunkte der Heizkreise setzen
    var cnt = 1;
    for (var HK in Heizkreise) {
        Heizkreise[HK].firstId = Kessel.firstId + (10 * cnt++);
        initDatapoints(HK, Heizkreise[HK]);

        // Relaiszustand überwachen
        if (Heizkreise[HK].relaisId) {
            subscribe({
                id: Heizkreise[HK].relaisId
            },
                observeRelay.bind( Heizkreise[HK] )
            );
        }
        // TODO: nextSoll / nextZeit nur bei Heizkreisen
    }

    // einmalig Temperaturen setzen, fortan alle 5 Minuten
    setNominalTemp();
    schedule("0/5 * * * *", setNominalTemp);
}


initHeizung();
