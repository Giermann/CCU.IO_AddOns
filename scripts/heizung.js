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
//
// - "dynamisches" Kessel-Soll nach Ist-Temperatur setzen? (evtl. nicht Hysterese, sondern min/max getrennt setzen?)
// - Kessel-Notruf einführen, Verbraucher bei drohender Überhitzung einschalten!
// - Verbraucher nach Brenner-Aus nachlaufen lassen
//
// - Anlaufphase (soll = null) funktioniert noch nicht vernünftig! (setzt kein KesselSoll) ?
//   --> nur bei NULL auf irgendetwas setzen!
//
// - Ist-Temperatur-Datenpunkte und "Feiertag Heute/Morgen" nach Namen statt ID angeben?!
// - nextSoll & nextZeit setzen
//

/*

0 = firstId:               Channel Id
1 = countId:   ".Count"    Zähler der Einschaltvorgänge (wenn externId angegeben, wird diese überwacht)
2 = timeId:    ".Zeit"     Betriebsstundenzähler in Stunden
3 = storageId: ".Vorrat"   Heizöl/Rohstoff-Vorrat, wenn "usage" angegeben
4 = nomTempId: ".Soll"     Soll-Temperatur
4 = nomRoomId: ".RaumSoll" Soll-Raum-Temperatur bei witterungsgeführter Heizkennlinie
x = nextSoll               (Kessel kaum möglich)
x = nextZeit               (Kessel kaum möglich)

*/

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Konfiguration
//
var debugLogLevel = 3;
var feierTagFirstId = 300000;

var Boiler = { name:      "Kessel",
    firstId:   77000,  // hier erste ID für neu erstellte Datenpunkte einstellen. Es werden pro Kreis ... IDs reserviert (Bedeutung s.o.)
    curTempId: 74306,  // vorhandener Datenpunkt mit Ist-Temperatur
    relayId:   77101,  // vorhandener Datenpunkt für Relais der Brenneranforderung
    statusId:  77107,  // vorhandener Datenpunkt für Zählung der Brennerbetriebszeit/Anschaltzyklen (notfalls =relayId)
    usage:     0.0205, // Heizöl/Rohstoff-Verbrauch pro Betriebsstunde (hier in Hektoliter, dadurch bessere Anzeige)
    hysterese: 10,
    minTemp:   40,
    maxTemp:   75
}
var Circuits = {
    "_1":{   name: "Brauchwasser",
        addBoiler:  15,    // wieviel Kelvin muss Kessel mehr als Soll haben
        notlauf:    50,    // Fallback, wenn (noch) keine Uhrzeit verfügbar ist
        curTempId:  74308, // vorhandener Datenpunkt mit Ist-Temperatur
        relayId:    77102, // vorhandener Datenpunkt für Relais der Ladepumpe
        hysterese:  10,
        delayOff:   60,    // wie viel Sekunden soll Ausschaltung des Relais verzögert werden (Schutz vor Kesselüberhitzung)
        "_0":{             // benannte Zeitprogramme
            "0600":50,
            "0800":60,     // Legionellenschutz der alten Steuerung vorbereiten
            "0900":0,
            "1200":50,
            "2130":0
        },
        "_1":{
            "0600":50,
            "0900":0,
            "1200":50,
            "2130":0
        },
        "_2":{
            "0600":50,
            "2130":0
        },
        "_3":{
            "0600":50,
            "0900":0,
            "1200":50,
            "1330":0
        },
        "_4":{
            "0100":0
        },
        "_5":{
            "1500":50,
            "2130":0
        },
        dayprogram:{       // Wochentagsprogramme
            1:"_0",
            2:"_1",
            3:"_1",
            4:"_1",
            5:"_1",
            6:"_2",
            0:"_2"
        }
    },
    "_2":{   name: "Fussboden",
        addBoiler: -20,
        notlauf:    21.5,
        curTempId:  74303,
        relayId:    77103,
        mischerId:  77105,
        loggingId:  77108, // vorhandener Datenpunkt für Status/Temperaturlogging
        retTempId:  74302,
        hysterese:  3,
        outTempId:  74310, // vorhandener Datenpunkt für witterungsgeführte Heizkennlinie
        roomTempId: 74309,
        adapt:      6,
        "_1":{             // benannte Zeitprogramme
            "0530":22.5,
            "0900":20.0,
            "1200":22.5,
            "2000":20.0
        },
        "_2":{
            "0530":22.5,
            "0900":20.0,
            "1200":22.5,
            "2100":20.0
        },
        "_3":{
            "0530":22.5,
            "2100":20.0
        },
        "_4":{
            "0530":22.5,
            "2000":20.0
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
    "_3":{   name: "Heizkreis",
        addBoiler: -15,
        notlauf:    23.5,
        curTempId:  74305,
        relayId:    77104,
        mischerId:  77106,
        loggingId:  77109, // vorhandener Datenpunkt für Status/Temperaturlogging
        retTempId:  74304,
        hysterese:  3,
        outTempId:  74310, // vorhandener Datenpunkt für witterungsgeführte Heizkennlinie
        adapt:      15,
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
//   observeStatus.bind( Circuits[...] );
//
function observeStatus(data) {
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

function observeLogging(data) {
    var tempStr =
          " Vt:" + parseFloat(getState(this.curTempId)).toFixed(1)
        + " Rt:" + parseFloat(getState(this.retTempId)).toFixed(1)
//        + " Kt:" + parseFloat(getState(74306)).toFixed(1)
        + " St:" + parseFloat(getState(this.nomTempId)).toFixed(1)
        + " At:" + parseFloat(getState(74310)).toFixed(1)
        + " Wz:" + parseFloat(getState(74309)).toFixed(1)
//        + " VdA:" + (parseFloat(getState(this.curTempId)) - parseFloat(getState(74310))).toFixed(1)
        + " VdS:" + (parseFloat(getState(this.curTempId)) - parseFloat(getState(this.nomTempId))).toFixed(1);

    if (data && (data.oldState.value != null) && (data.oldState.value >= 0)) {
        if ((data.newState.value == true) || (data.newState.value > 0)) {
            // Einschaltvorgang
            log("[observeLogging] " + this.name + "->ON " + tempStr);
        } else if ((data.newState.value == false) || (data.newState.value == 0)) {
            // Ausschaltvorgang
            log("[observeLogging] " + this.name + "->OFF" + tempStr);
        }
    } else {
        log("[observeLogging] " + this.name + "     " + tempStr);
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Überwachung/Regulierung der Soll-Temperaturen und Relaiszustände
//
// TODO: Bisher reine Speicherladung mittels Pumpe, noch KEIN Pumpenkreis, noch KEIN Mischerkreis
//
// use:
//   observeTemp.bind( Circuits[...] );
//   observeRelay.bind( Circuits[...] );
//   observeTempAdapt.bind( Circuits[...] );
//
function observeTemp(data) {
    var minTemp, maxTemp, curTemp;

    if (this.curTempId) {
        curTemp = getState(this.curTempId);
        minTemp = getState(this.nomTempId) - (this.hysterese || 10)/2;
        maxTemp = minTemp + (this.hysterese || 10);
        if (this.minTemp && (this.minTemp > minTemp)) minTemp = this.minTemp;
        if (this.maxTemp && (this.maxTemp < maxTemp)) maxTemp = this.maxTemp;
    }

    if (!curTemp) {
        logOutput(4, "[observeTemp] cannot read temperature for circuit '" + this.name + "' on change of #" + data.id);
    } else if (this.relayId) {
        var rel = getState(this.relayId);
        if (curTemp < minTemp) {
            if (this.delayOffTimeout) {
                // avoid delayed turning off
                clearTimeout(this.delayOffTimeout);
                this.delayOffTimeout = null;
            }
            if (rel != true) {
                // turn on, if relay is off
                logOutput(2, "[observeTemp] set relay '" + this.name + "' ON (temp " + curTemp + " < " + minTemp + ")");
                setState(this.relayId, true);
            }
        } else if (!this.delayOffTimeout && (rel != false) && (curTemp >= maxTemp)) {
            logOutput(2, "[observeTemp] set relay '" + this.name + "' OFF (temp " + curTemp + " > " + maxTemp + ")");
            if (this.delayOff && this.delayOff > 0) {
                // unset nomBoiler and calculate new nominal Boiler temp
                this.nomBoiler = 0;
                observeRelay({ newState: {value: false} });
                this.delayOffTimeout = setTimeout( function(){
                    logOutput(2, "[delayOffTimeout] for relay '"+this.name+"'");
                    this.delayOffTimeout = null;
                    setState(this.relayId, false);
                }.bind(this), this.delayOff * 1000 );
            } else {
                setState(this.relayId, false);
            }
        }
    }
}

function observeRelay(data) {
    var nomTemp = getState(this.nomTempId);

    // beim Einschalten des Relais, prüfen ob Kessel-Soll erhöht werden muss
    if (data.newState.value && (nomTemp > 0)) {
        this.nomBoiler = nomTemp + (this.addBoiler || 10) + (this.hysterese || 10)/2;
        if (this.nomBoiler > getState(Boiler.nomTempId))
            setState(Boiler.nomTempId, this.nomBoiler);
        logOutput(2, "[observeRelay] set demand for '" + this.name + "' to " + nomTemp + "°C");
    } else {
        this.nomBoiler = 0;

        // frage Maximum aller anderen Heizkreise ab, starte mit Kessel-Mindesttemperatur
        nomTemp = (Boiler.minTemp || 40);
        for (var circuit in Circuits) {
            if (nomTemp < Circuits[circuit].nomBoiler) nomTemp = Circuits[circuit].nomBoiler;
        }
        setState(Boiler.nomTempId, nomTemp);
        logOutput(2, "[observeRelay] unset demand for '" + this.name + "', reset to " + nomTemp + "°C");
    }
}

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Adaption der Soll-Raum-Temperaturen in Soll-Vorlauf-Temperaturen
// ('data' hier komplett ungenutzt)
//
// Heizkreis:
//   - tagsüber (23.5) 0.8 zu nied                      23/-23
//   - tagsüber (23.5)                                  23/-21
//
// Fussboden:
//   - tagsüber (22.5) 1.6 zu nied (Diff -2.9)          22/-23
//   - tagsüber (22.5)                                  22/-21
//
// Fazit:
// - die Abhängigkeit von At scheint (beim HK) zu stimmen!
//
function observeTempAdapt(data) {
    var nomTemp,
        outTemp = parseFloat(getState(this.outTempId)),
        nomRoom = parseFloat(getState(this.nomRoomId));

    nomTemp =
// mit diesen Werten ist At-Einfluss VIEL zu hoch!
//        0.09 * (this.adapt || 15) * (23 - outTemp) * Math.pow(nomRoom, 0.25*outTemp/(100-outTemp)) +
//        2*nomRoom - 23 + (this.roomTempId ? 2 * (nomRoom - parseFloat(getState(this.roomTempId))) : 0);
// 17.02.2015 - umgestellt (bei FB At-Einfluss immer noch zu hoch):
//        0.175 * (this.adapt || 15) * Math.pow(nomRoom - outTemp + 2, 0.795) +
//        1*nomRoom - 2 + (this.roomTempId ? 2 * (nomRoom - parseFloat(getState(this.roomTempId))) : 0);
//        nomRoom; // 18.02.2015 - workaround to test formulas in Highcharts
//        (3.84 - 0.124 * (this.adapt || 15)) * nomRoom - 0.06 * (this.adapt || 15) * outTemp + 4.183 * (this.adapt || 15) - 54.3
// so stimmts jetzt (fast)
// FB: bei At>5 etwas zu kalt
        (3.84 - 0.124 * (this.adapt || 15)) * nomRoom - 0.06 * (this.adapt || 15) * outTemp + 4.07 * (this.adapt || 15) - 52.6
        + (this.roomTempId ? 0.0 * (nomRoom - parseFloat(getState(this.roomTempId))) : 0);
    // round result to 1/10
    setState(this.nomTempId, Math.round(nomTemp*10)/10);

    logOutput(1, "[observeTempAdapt] " + this.name + "   "
        + " nom:" + nomRoom.toFixed(1)
        + "/adapt:" + (this.adapt || 15)
        + " out:" + outTemp.toFixed(1)
        + (this.roomTempId ? " in:" + parseFloat(getState(this.roomTempId)).toFixed(1) : "")
        + " --> " + nomTemp.toFixed(1) + " (cur:" + parseFloat(getState(this.curTempId)).toFixed(1) + ")");
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Zeitplanung der Soll-Temperaturen
//
function getNominalTemp(circuit, curTime, weekday) {
    var nomTemp = -1;
    var nomTime = "0000";
    var prog;

    if (circuit.dayprogram) {
        logOutput(2, "[getNominalTemp] read program for day " + weekday);
        if (circuit.dayprogram[weekday])
            prog = circuit[circuit.dayprogram[weekday]];
    }
    if (!prog) {
        // wenn keine Sektion "dayprogram" gefunden, dann für alle Tage "program" nutzen
        prog = circuit.program;
        if (program)
            logOutput(2, "[getNominalTemp] read global program");
        else
            logOutput(4, "[getNominalTemp] no program found!");
    }

    if (prog) for (var progTime in prog) {
        if ((nomTime <= progTime) && (curTime >= progTime)) {
            nomTemp = prog[progTime];
            nomTime = progTime;
            logOutput(1, "[getNominalTemp] use '" + progTime + "' temp " + nomTemp + "°C");
        } else
            logOutput(1, "[getNominalTemp] skip '" + progTime + "'");
    }

    return nomTemp;
}

function setNominalTemp() {
    var nomTemp, now = new Date();
    var timeNow = ("0" + now.getHours()).slice(-2) + ("0" + now.getMinutes()).slice(-2);
    var today = now.getDay();

    // Feiertagslogik
    if (getState(feierTagFirstId)) today = 0;                           // "Feiertag Heute" = Sonntag
    if ((today == 0) && getState(feierTagFirstId + 2)) today = 6;       // Sonntag/Feiertag + "Feiertag Morgen" = Samstag
    if ((today == 0) && (now.getDay > 4)) today = 6;                    // Feiertag vor einem Wochenende = Samstag

    // alle Heizkreise durchlaufen
    for (var circuit in Circuits) {
        // Soll-Temperatur nach Zeitplan nur bestimmen, wenn Datum/Uhrzeit stimmt; sonst Notlauf-Temperatur belassen
        if (now.getFullYear() < 2000) {
            nomTemp = Circuits[circuit].notlauf;
        } else {
            nomTemp = getNominalTemp(Circuits[circuit], timeNow, today);

            // wenn keine gefunden: zuletzt gesetzte Soll-Temperatur auslesen
            if (nomTemp < 0) {
                nomTemp = getState(Circuits[circuit].outTempId ? Circuits[circuit].nomRoomId : Circuits[circuit].nomTempId);
                // ist diese unbrauchbar, letzte Soll-Temperatur des Vortages ermitteln
                // HINWEIS: hier erfolgt keine Prüfung, ob gestern ein Feiertag war - sollte aber recht selten eintreten
                if (!nomTemp) nomTemp = getNominalTemp(Circuits[circuit], "2400", (now.getDay() + 6) % 7);
            }
        }
        if (nomTemp >= 0) {
            // bei witterungsgeführter Heizkennlinie die Raum-Soll-Temperatur setzen, sonst direkt
            logOutput(2, "[setNominalTemp] set '" + Circuits[circuit].name + "' [" + timeNow + "] to " + nomTemp + "°C");
            setState(Circuits[circuit].outTempId ? Circuits[circuit].nomRoomId : Circuits[circuit].nomTempId, nomTemp);
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
function initDatapoints(circuit) {
    // Betriebsstundenzähler
    if (circuit.statusId) {
        circuit.countId = circuit.firstId + 1;
        setObject(circuit.countId, {
            Name: "Heizung." + circuit.name + ".Cnt",
            TypeName: "VARDP",
            _persistent: true
        });
        logOutput(3, "[initDatapoints] created datapoint #" + circuit.countId + " 'Heizung." + circuit.name + ".Cnt'");

        circuit.timeId = circuit.firstId + 2;
        setObject(circuit.timeId, {
            Name: "Heizung." + circuit.name + ".Zeit",
            TypeName: "VARDP",
            _persistent: true
        });
        logOutput(3, "[initDatapoints] created datapoint #" + circuit.timeId + " 'Heizung." + circuit.name + ".Zeit'");

        if (circuit.usage) {
            circuit.storageId = circuit.firstId + 3;
            setObject(circuit.storageId, {
                Name: "Heizung." + circuit.name + ".Vorrat",
                TypeName: "VARDP",
                _persistent: true
            });
            logOutput(3, "[initDatapoints] created datapoint #" + circuit.storageId + " 'Heizung." + circuit.name + ".Vorrat'");
        } else {
            circuit.storageId = null;
        }

        subscribe({
            id: circuit.statusId, change:"ne"
        },
            observeStatus.bind( circuit )
        );
    }

    // Soll-Temperatur
    circuit.nomTempId = circuit.firstId + 4;
    setObject(circuit.nomTempId, {
        Name: "Heizung." + circuit.name + ".Soll",
        TypeName: "VARDP",
        ValueUnit: "°C",
        _persistent: true
    });
    logOutput(3, "[initDatapoints] created datapoint #" + circuit.nomTempId + " 'Heizung." + circuit.name + ".Soll'");

    // witterungsgeführte Heizkennlinie
    if (circuit.outTempId) {
        circuit.nomRoomId = circuit.firstId + 5;
        setObject(circuit.nomRoomId, {
            Name: "Heizung." + circuit.name + ".RaumSoll",
            TypeName: "VARDP",
            ValueUnit: "°C",
            _persistent: true
        });
        logOutput(3, "[initDatapoints] created datapoint #" + circuit.nomRoomId + " 'Heizung." + circuit.name + ".RaumSoll'");
        // einmalig Soll-Temperatur bestimmen, auch ohne Temperaturänderung
        setTimeout( observeTempAdapt.bind( circuit ), 5000 );

        subscribe({
            id: circuit.nomRoomId, change:"ne"
        },
            observeTempAdapt.bind( circuit )
        );

        subscribe({
            id: circuit.outTempId, change:"ne"
        },
            observeTempAdapt.bind( circuit )
        );

        if (circuit.roomTempId) subscribe({
            id: circuit.roomTempId, change:"ne"
        },
            observeTempAdapt.bind( circuit )
        );
    }

    if (circuit.curTempId) {
        // wenn Ist-Temperatur vorhanden, dann Soll- und Ist-Temperatur überwachen
        subscribe({
            id: circuit.nomTempId, change:"ne"
        },
            observeTemp.bind( circuit )
        );

        subscribe({
            id: circuit.curTempId, change:"ne"
        },
            observeTemp.bind( circuit )
        );

        // temporary!
        if (circuit.loggingId) subscribe({
            id: circuit.loggingId, change:"ne"
        },
            observeLogging.bind( circuit )
        );
    }
}

function initHeizung() {
    if (!Boiler.firstId) {
        logOutput(5, "[initHeizung] Configuration error - exiting.");
        return;
    }
    // Datenpunkte erstellen und auf Notlauftemperatur stellen
    initDatapoints( Boiler );

    // Datenpunkte der Circuits setzen
    var cnt = 1;
    for (var circuit in Circuits) {
        Circuits[circuit].firstId = Boiler.firstId + (10 * cnt++);
        initDatapoints( Circuits[circuit] );

        // Relaiszustand überwachen, um Kessel-Soll-Temperatur zu setzen
        if (Circuits[circuit].relayId) {
            subscribe({
                id: Circuits[circuit].relayId, change:"ne"
            },
                observeRelay.bind( Circuits[circuit] )
            );
        }
        // TODO: nextSoll / nextZeit nur bei Heizkreisen
    }

    // einmalig Kessel-Anforderung lesen (Relais Aus für imaginären Heizkreis simlulieren)
    observeRelay({ newState: {value: false} });

    // einmalig Temperaturen setzen, fortan alle 5 Minuten
    setNominalTemp();
    schedule("0/5 * * * *", setNominalTemp);

    // temporary!
    schedule( "3 9,20,21 * * *", observeLogging.bind( Circuits["_2"] ) );
    schedule( "3 9,22 * * *", observeLogging.bind( Circuits["_3"] ) );
    setTimeout( observeLogging.bind( Circuits["_2"] ), 60000 );
    setTimeout( observeLogging.bind( Circuits["_3"] ), 60000 );
 
//    email({text: "Heizung script started."});
}


initHeizung();

