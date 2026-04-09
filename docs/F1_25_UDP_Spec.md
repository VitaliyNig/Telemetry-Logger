# F1® 25 — UDP Data Output Specification

> **DISCLAIMER:** This information is provided under license from EA for reference purposes only.

---

## Contents
1. [Overview](#overview)
2. [Packet Information](#packet-information)
3. [Packet Types & Structures](#packet-types--structures)
4. [FAQs](#faqs)
5. [Appendices](#appendices)

---

## Overview

The F1® 25 Game outputs game data over UDP connections. This data can supply race information to external applications or drive hardware (motion platforms, force feedback wheels, LED devices).

- **Encoding:** Little Endian
- **Packing:** All data is packed (no padding)
- **Max cars per packet:** 22

---

## Packet Information

### Primitive Data Types

| Type   | Description                          |
|--------|--------------------------------------|
| uint8  | Unsigned 8-bit integer               |
| int8   | Signed 8-bit integer                 |
| uint16 | Unsigned 16-bit integer              |
| int16  | Signed 16-bit integer                |
| uint32 | Unsigned 32-bit integer              |
| float  | Floating point (32-bit)              |
| double | Double-precision floating point (64-bit) |
| uint64 | Unsigned 64-bit integer              |
| char   | Character                            |

---

### Packet Header

Every packet begins with this header:

```c
struct PacketHeader
{
    uint16 m_packetFormat;              // 2025
    uint8  m_gameYear;                  // Last two digits, e.g. 25
    uint8  m_gameMajorVersion;          // "X.00"
    uint8  m_gameMinorVersion;          // "1.XX"
    uint8  m_packetVersion;             // Starts from 1
    uint8  m_packetId;                  // See Packet IDs table
    uint64 m_sessionUID;                // Unique session identifier
    float  m_sessionTime;               // Session timestamp
    uint32 m_frameIdentifier;           // Frame identifier
    uint32 m_overallFrameIdentifier;    // Overall frame id (doesn't reset after flashback)
    uint8  m_playerCarIndex;            // Player's car index
    uint8  m_secondaryPlayerCarIndex;   // Secondary player car index (255 = none)
};
```

---

### Packet IDs

| ID | Packet Name          | Description                                              | Frequency         | Size (bytes) |
|----|----------------------|----------------------------------------------------------|-------------------|--------------|
| 0  | Motion               | Physics data for player's car (only while in control)    | Menu rate         | 1349         |
| 1  | Session              | Track, time left, weather, settings                      | 2/sec             | 753          |
| 2  | Lap Data             | Lap times for all cars                                   | Menu rate         | 1285         |
| 3  | Event                | Notable session events                                   | On event          | 45           |
| 4  | Participants         | Participant list (mainly multiplayer)                    | Every 5 sec       | 1284         |
| 5  | Car Setups           | Car setup details                                        | 2/sec             | 1133         |
| 6  | Car Telemetry        | Speed, throttle, DRS, temps, etc.                        | Menu rate         | 1352         |
| 7  | Car Status           | Fuel, ERS, tyres, flags                                  | Menu rate         | 1239         |
| 8  | Final Classification | End-of-race classification                               | Once at race end  | 1042         |
| 9  | Lobby Info           | Multiplayer lobby players                                | 2/sec (lobby)     | 954          |
| 10 | Car Damage           | Damage status for all cars                               | 10/sec            | 1041         |
| 11 | Session History      | Lap times & tyre data (cycles through cars)              | 20/sec (cycled)   | 1460         |
| 12 | Tyre Sets            | Extended tyre set data (cycles through cars)             | 20/sec (cycled)   | 231          |
| 13 | Motion Ex            | Extended motion data for player car                      | Menu rate         | 273          |
| 14 | Time Trial           | Time trial specific data                                 | 1/sec             | 101          |
| 15 | Lap Positions        | Position of each car per lap (for chart)                 | 1/sec             | 1131         |

---

## Packet Types & Structures

### 0 — Motion Packet

Physics data for all cars on track.

> **Note:** Normalised vectors (int16) → divide by `32767.0f` to get float in range [-1.0, 1.0]

```c
struct CarMotionData
{
    float m_worldPositionX;      // World X position (metres)
    float m_worldPositionY;      // World Y position
    float m_worldPositionZ;      // World Z position
    float m_worldVelocityX;      // Velocity X (metres/s)
    float m_worldVelocityY;      // Velocity Y
    float m_worldVelocityZ;      // Velocity Z
    int16 m_worldForwardDirX;    // Forward X direction (normalised)
    int16 m_worldForwardDirY;    // Forward Y direction (normalised)
    int16 m_worldForwardDirZ;    // Forward Z direction (normalised)
    int16 m_worldRightDirX;      // Right X direction (normalised)
    int16 m_worldRightDirY;      // Right Y direction (normalised)
    int16 m_worldRightDirZ;      // Right Z direction (normalised)
    float m_gForceLateral;       // Lateral G-Force
    float m_gForceLongitudinal;  // Longitudinal G-Force
    float m_gForceVertical;      // Vertical G-Force
    float m_yaw;                 // Yaw angle (radians)
    float m_pitch;               // Pitch angle (radians)
    float m_roll;                // Roll angle (radians)
};

struct PacketMotionData
{
    PacketHeader   m_header;
    CarMotionData  m_carMotionData[22];
};
```

---

### 1 — Session Packet

Current session details (track, weather, settings, assists).

```c
struct MarshalZone
{
    float m_zoneStart;  // Fraction (0..1) of lap where zone starts
    int8  m_zoneFlag;   // -1=invalid, 0=none, 1=green, 2=blue, 3=yellow
};

struct WeatherForecastSample
{
    uint8 m_sessionType;              // See Session Types appendix
    uint8 m_timeOffset;               // Minutes ahead for forecast
    uint8 m_weather;                  // 0=clear,1=light cloud,2=overcast,3=light rain,4=heavy rain,5=storm
    int8  m_trackTemperature;         // Track temp (°C)
    int8  m_trackTemperatureChange;   // 0=up,1=down,2=no change
    int8  m_airTemperature;           // Air temp (°C)
    int8  m_airTemperatureChange;     // 0=up,1=down,2=no change
    uint8 m_rainPercentage;           // Rain chance (0-100)
};

struct PacketSessionData
{
    PacketHeader          m_header;
    uint8                 m_weather;                  // 0=clear..5=storm
    int8                  m_trackTemperature;
    int8                  m_airTemperature;
    uint8                 m_totalLaps;
    uint16                m_trackLength;              // metres
    uint8                 m_sessionType;              // See appendix
    int8                  m_trackId;                  // See appendix (-1=unknown)
    uint8                 m_formula;                  // 0=F1 Modern,1=F1 Classic,2=F2,3=F1 Generic,4=Beta,6=Esports,8=F1 World,9=F1 Elimination
    uint16                m_sessionTimeLeft;          // seconds
    uint16                m_sessionDuration;          // seconds
    uint8                 m_pitSpeedLimit;            // km/h
    uint8                 m_gamePaused;               // network only
    uint8                 m_isSpectating;
    uint8                 m_spectatorCarIndex;
    uint8                 m_sliProNativeSupport;      // 0=inactive,1=active
    uint8                 m_numMarshalZones;
    MarshalZone           m_marshalZones[21];
    uint8                 m_safetyCarStatus;          // 0=none,1=full,2=virtual,3=formation lap
    uint8                 m_networkGame;              // 0=offline,1=online
    uint8                 m_numWeatherForecastSamples;
    WeatherForecastSample m_weatherForecastSamples[64];
    uint8                 m_forecastAccuracy;         // 0=Perfect,1=Approximate
    uint8                 m_aiDifficulty;             // 0-110
    uint32                m_seasonLinkIdentifier;
    uint32                m_weekendLinkIdentifier;
    uint32                m_sessionLinkIdentifier;
    uint8                 m_pitStopWindowIdealLap;
    uint8                 m_pitStopWindowLatestLap;
    uint8                 m_pitStopRejoinPosition;
    uint8                 m_steeringAssist;           // 0=off,1=on
    uint8                 m_brakingAssist;            // 0=off,1=low,2=medium,3=high
    uint8                 m_gearboxAssist;            // 1=manual,2=manual+suggested,3=auto
    uint8                 m_pitAssist;
    uint8                 m_pitReleaseAssist;
    uint8                 m_ERSAssist;
    uint8                 m_DRSAssist;
    uint8                 m_dynamicRacingLine;        // 0=off,1=corners only,2=full
    uint8                 m_dynamicRacingLineType;    // 0=2D,1=3D
    uint8                 m_gameMode;                 // See appendix
    uint8                 m_ruleSet;                  // See appendix
    uint32                m_timeOfDay;                // Minutes since midnight
    uint8                 m_sessionLength;            // 0=None,2=Very Short,3=Short,4=Medium,5=Medium Long,6=Long,7=Full
    uint8                 m_speedUnitsLeadPlayer;     // 0=MPH,1=KPH
    uint8                 m_temperatureUnitsLeadPlayer; // 0=Celsius,1=Fahrenheit
    uint8                 m_speedUnitsSecondaryPlayer;
    uint8                 m_temperatureUnitsSecondaryPlayer;
    uint8                 m_numSafetyCarPeriods;
    uint8                 m_numVirtualSafetyCarPeriods;
    uint8                 m_numRedFlagPeriods;
    uint8                 m_equalCarPerformance;      // 0=off,1=on
    uint8                 m_recoveryMode;             // 0=None,1=Flashbacks,2=Auto-recovery
    uint8                 m_flashbackLimit;           // 0=Low,1=Medium,2=High,3=Unlimited
    uint8                 m_surfaceType;              // 0=Simplified,1=Realistic
    uint8                 m_lowFuelMode;              // 0=Easy,1=Hard
    uint8                 m_raceStarts;               // 0=Manual,1=Assisted
    uint8                 m_tyreTemperature;          // 0=Surface only,1=Surface & Carcass
    uint8                 m_pitLaneTyreSim;           // 0=on,1=off
    uint8                 m_carDamage;               // 0=off,1=Reduced,2=Standard,3=Simulation
    uint8                 m_carDamageRate;            // 0=Reduced,1=Standard,2=Simulation
    uint8                 m_collisions;               // 0=off,1=Player-to-Player Off,2=on
    uint8                 m_collisionsOffForFirstLapOnly;
    uint8                 m_mpUnsafePitRelease;
    uint8                 m_mpOffForGriefing;
    uint8                 m_cornerCuttingStringency;  // 0=Regular,1=Strict
    uint8                 m_parcFermeRules;
    uint8                 m_pitStopExperience;        // 0=Automatic,1=Broadcast,2=Immersive
    uint8                 m_safetyCar;                // 0=off,1=Reduced,2=Standard,3=Increased
    uint8                 m_safetyCarExperience;      // 0=Broadcast,1=Immersive
    uint8                 m_formationLap;
    uint8                 m_formationLapExperience;
    uint8                 m_redFlags;
    uint8                 m_affectsLicenceLevelSolo;
    uint8                 m_affectsLicenceLevelMP;
    uint8                 m_numSessionsInWeekend;
    uint8                 m_weekendStructure[12];     // See Session Types appendix
    float                 m_sector2LapDistanceStart;  // metres
    float                 m_sector3LapDistanceStart;  // metres
};
```

---

### 2 — Lap Data Packet

Lap times and status for all cars.

```c
struct LapData
{
    uint32 m_lastLapTimeInMS;
    uint32 m_currentLapTimeInMS;
    uint16 m_sector1TimeMSPart;
    uint8  m_sector1TimeMinutesPart;
    uint16 m_sector2TimeMSPart;
    uint8  m_sector2TimeMinutesPart;
    uint16 m_deltaToCarInFrontMSPart;
    uint8  m_deltaToCarInFrontMinutesPart;
    uint16 m_deltaToRaceLeaderMSPart;
    uint8  m_deltaToRaceLeaderMinutesPart;
    float  m_lapDistance;           // metres (can be negative before line crossed)
    float  m_totalDistance;         // metres (can be negative)
    float  m_safetyCarDelta;        // seconds
    uint8  m_carPosition;
    uint8  m_currentLapNum;
    uint8  m_pitStatus;             // 0=none,1=pitting,2=in pit area
    uint8  m_numPitStops;
    uint8  m_sector;                // 0=sector1,1=sector2,2=sector3
    uint8  m_currentLapInvalid;     // 0=valid,1=invalid
    uint8  m_penalties;             // seconds
    uint8  m_totalWarnings;
    uint8  m_cornerCuttingWarnings;
    uint8  m_numUnservedDriveThroughPens;
    uint8  m_numUnservedStopGoPens;
    uint8  m_gridPosition;
    uint8  m_driverStatus;          // 0=in garage,1=flying lap,2=in lap,3=out lap,4=on track
    uint8  m_resultStatus;          // 0=invalid,1=inactive,2=active,3=finished,4=DNF,5=DSQ,6=not classified,7=retired
    uint8  m_pitLaneTimerActive;
    uint16 m_pitLaneTimeInLaneInMS;
    uint16 m_pitStopTimerInMS;
    uint8  m_pitStopShouldServePen;
    float  m_speedTrapFastestSpeed; // km/h
    uint8  m_speedTrapFastestLap;   // 255=not set
};

struct PacketLapData
{
    PacketHeader m_header;
    LapData      m_lapData[22];
    uint8        m_timeTrialPBCarIdx;     // 255=invalid
    uint8        m_timeTrialRivalCarIdx;  // 255=invalid
};
```

---

### 3 — Event Packet

Fired when notable events occur during a session.

#### Event String Codes

| Code   | Event                  | Description                                      |
|--------|------------------------|--------------------------------------------------|
| `SSTA` | Session Started        | Session has started                              |
| `SEND` | Session Ended          | Session has ended                                |
| `FTLP` | Fastest Lap            | Driver achieved fastest lap                      |
| `RTMT` | Retirement             | Driver has retired                               |
| `DRSE` | DRS Enabled            | Race control enabled DRS                         |
| `DRSD` | DRS Disabled           | Race control disabled DRS                        |
| `TMPT` | Team Mate in Pits      | Team mate entered pits                           |
| `CHQF` | Chequered Flag         | Chequered flag waved                             |
| `RCWN` | Race Winner            | Race winner announced                            |
| `PENA` | Penalty Issued         | Penalty issued (see event details)               |
| `SPTP` | Speed Trap Triggered   | Speed trap triggered by fastest speed            |
| `STLG` | Start Lights           | Start lights shown (number in event)             |
| `LGOT` | Lights Out             | Lights out — race start                          |
| `DTSV` | Drive Through Served   | Drive through penalty served                     |
| `SGSV` | Stop Go Served         | Stop go penalty served                           |
| `FLBK` | Flashback              | Flashback activated                              |
| `BUTN` | Button Status          | Button status changed                            |
| `RDFL` | Red Flag               | Red flag shown                                   |
| `OVTK` | Overtake               | Overtake occurred                                |
| `SCAR` | Safety Car             | Safety car event (see event details)             |
| `COLL` | Collision              | Collision between two vehicles                   |

```c
union EventDataDetails
{
    struct { uint8 vehicleIdx; float lapTime; } FastestLap;
    struct { uint8 vehicleIdx; uint8 reason; } Retirement;
    // reason: 0=invalid,1=retired,2=finished,3=terminal damage,4=inactive,
    //         5=not enough laps,6=black flagged,7=red flagged,8=mechanical failure,
    //         9=session skipped,10=session simulated

    struct { uint8 reason; } DRSDisabled;
    // reason: 0=Wet track,1=Safety car deployed,2=Red flag,3=Min lap not reached

    struct { uint8 vehicleIdx; } TeamMateInPits;
    struct { uint8 vehicleIdx; } RaceWinner;

    struct {
        uint8 penaltyType;
        uint8 infringementType;
        uint8 vehicleIdx;
        uint8 otherVehicleIdx;
        uint8 time;
        uint8 lapNum;
        uint8 placesGained;
    } Penalty;

    struct {
        uint8 vehicleIdx;
        float speed;
        uint8 isOverallFastestInSession;
        uint8 isDriverFastestInSession;
        uint8 fastestVehicleIdxInSession;
        float fastestSpeedInSession;
    } SpeedTrap;

    struct { uint8 numLights; } StartLights;
    struct { uint8 vehicleIdx; } DriveThroughPenaltyServed;
    struct { uint8 vehicleIdx; float stopTime; } StopGoPenaltyServed;

    struct {
        uint32 flashbackFrameIdentifier;
        float  flashbackSessionTime;
    } Flashback;

    struct { uint32 buttonStatus; } Buttons;

    struct { uint8 overtakingVehicleIdx; uint8 beingOvertakenVehicleIdx; } Overtake;

    struct {
        uint8 safetyCarType;  // 0=None,1=Full,2=Virtual,3=Formation Lap
        uint8 eventType;      // 0=Deployed,1=Returning,2=Returned,3=Resume Race
    } SafetyCar;

    struct { uint8 vehicle1Idx; uint8 vehicle2Idx; } Collision;
};

struct PacketEventData
{
    PacketHeader     m_header;
    uint8            m_eventStringCode[4];
    EventDataDetails m_eventDetails;
};
```

---

### 4 — Participants Packet

```c
struct LiveryColour { uint8 red; uint8 green; uint8 blue; };

struct ParticipantData
{
    uint8        m_aiControlled;       // 1=AI, 0=Human
    uint8        m_driverId;           // See appendix (255=network human)
    uint8        m_networkId;
    uint8        m_teamId;             // See appendix
    uint8        m_myTeam;             // 1=My Team
    uint8        m_raceNumber;
    uint8        m_nationality;        // See appendix
    char         m_name[32];           // UTF-8, null-terminated, truncated with … if too long
    uint8        m_yourTelemetry;      // 0=restricted,1=public
    uint8        m_showOnlineNames;    // 0=off,1=on
    uint16       m_techLevel;          // F1 World tech level
    uint8        m_platform;           // 1=Steam,3=PlayStation,4=Xbox,6=Origin,255=unknown
    uint8        m_numColours;
    LiveryColour m_liveryColours[4];
};

struct PacketParticipantsData
{
    PacketHeader    m_header;
    uint8           m_numActiveCars;
    ParticipantData m_participants[22];
};
```

---

### 5 — Car Setups Packet

> In multiplayer, only your own car setup is visible regardless of telemetry setting.

```c
struct CarSetupData
{
    uint8 m_frontWing;
    uint8 m_rearWing;
    uint8 m_onThrottle;              // Differential on throttle (%)
    uint8 m_offThrottle;             // Differential off throttle (%)
    float m_frontCamber;
    float m_rearCamber;
    float m_frontToe;
    float m_rearToe;
    uint8 m_frontSuspension;
    uint8 m_rearSuspension;
    uint8 m_frontAntiRollBar;
    uint8 m_rearAntiRollBar;
    uint8 m_frontSuspensionHeight;
    uint8 m_rearSuspensionHeight;
    uint8 m_brakePressure;           // %
    uint8 m_brakeBias;               // %
    uint8 m_engineBraking;           // %
    float m_rearLeftTyrePressure;    // PSI
    float m_rearRightTyrePressure;   // PSI
    float m_frontLeftTyrePressure;   // PSI
    float m_frontRightTyrePressure;  // PSI
    uint8 m_ballast;
    float m_fuelLoad;
};

struct PacketCarSetupData
{
    PacketHeader m_header;
    CarSetupData m_carSetups[22];
    float        m_nextFrontWingValue;  // After next pit stop (player only)
};
```

---

### 6 — Car Telemetry Packet

```c
struct CarTelemetryData
{
    uint16 m_speed;                       // km/h
    float  m_throttle;                    // 0.0-1.0
    float  m_steer;                       // -1.0 (full left) to 1.0 (full right)
    float  m_brake;                       // 0.0-1.0
    uint8  m_clutch;                      // 0-100
    int8   m_gear;                        // 1-8, N=0, R=-1
    uint16 m_engineRPM;
    uint8  m_drs;                         // 0=off,1=on
    uint8  m_revLightsPercent;
    uint16 m_revLightsBitValue;           // bit0=leftmost LED, bit14=rightmost
    uint16 m_brakesTemperature[4];        // °C [RL,RR,FL,FR]
    uint8  m_tyresSurfaceTemperature[4];  // °C [RL,RR,FL,FR]
    uint8  m_tyresInnerTemperature[4];    // °C [RL,RR,FL,FR]
    uint16 m_engineTemperature;           // °C
    float  m_tyresPressure[4];            // PSI [RL,RR,FL,FR]
    uint8  m_surfaceType[4];              // See Surface Types appendix
};

struct PacketCarTelemetryData
{
    PacketHeader      m_header;
    CarTelemetryData  m_carTelemetryData[22];
    uint8             m_mfdPanelIndex;              // 255=closed; 0=Car setup,1=Pits,2=Damage,3=Engine,4=Temperatures
    uint8             m_mfdPanelIndexSecondaryPlayer;
    int8              m_suggestedGear;              // 1-8, 0=none
};
```

---

### 7 — Car Status Packet

```c
struct CarStatusData
{
    uint8  m_tractionControl;          // 0=off,1=medium,2=full
    uint8  m_antiLockBrakes;           // 0=off,1=on
    uint8  m_fuelMix;                  // 0=lean,1=standard,2=rich,3=max
    uint8  m_frontBrakeBias;           // %
    uint8  m_pitLimiterStatus;         // 0=off,1=on
    float  m_fuelInTank;
    float  m_fuelCapacity;
    float  m_fuelRemainingLaps;
    uint16 m_maxRPM;
    uint16 m_idleRPM;
    uint8  m_maxGears;
    uint8  m_drsAllowed;               // 0=not allowed,1=allowed
    uint16 m_drsActivationDistance;    // 0=not available, else metres until available
    uint8  m_actualTyreCompound;
    // F1 Modern: 16=C5,17=C4,18=C3,19=C2,20=C1,21=C0,22=C6,7=inter,8=wet
    // F1 Classic: 9=dry,10=wet
    // F2: 11=super soft,12=soft,13=medium,14=hard,15=wet
    uint8  m_visualTyreCompound;
    // F1: 16=soft,17=medium,18=hard,7=inter,8=wet
    uint8  m_tyresAgeLaps;
    int8   m_vehicleFiaFlags;          // -1=unknown,0=none,1=green,2=blue,3=yellow
    float  m_enginePowerICE;           // W
    float  m_enginePowerMGUK;          // W
    float  m_ersStoreEnergy;           // Joules
    uint8  m_ersDeployMode;            // 0=none,1=medium,2=hotlap,3=overtake
    float  m_ersHarvestedThisLapMGUK;
    float  m_ersHarvestedThisLapMGUH;
    float  m_ersDeployedThisLap;
    uint8  m_networkPaused;
};

struct PacketCarStatusData
{
    PacketHeader  m_header;
    CarStatusData m_carStatusData[22];
};
```

---

### 8 — Final Classification Packet

```c
struct FinalClassificationData
{
    uint8  m_position;
    uint8  m_numLaps;
    uint8  m_gridPosition;
    uint8  m_points;
    uint8  m_numPitStops;
    uint8  m_resultStatus;   // 0=invalid,1=inactive,2=active,3=finished,4=DNF,5=DSQ,6=not classified,7=retired
    uint8  m_resultReason;   // 0=invalid,1=retired,2=finished,3=terminal damage,4=inactive,5=not enough laps,6=black flagged,7=red flagged,8=mechanical failure,9=session skipped,10=session simulated
    uint32 m_bestLapTimeInMS;
    double m_totalRaceTime;  // seconds (without penalties)
    uint8  m_penaltiesTime;  // seconds
    uint8  m_numPenalties;
    uint8  m_numTyreStints;
    uint8  m_tyreStintsActual[8];
    uint8  m_tyreStintsVisual[8];
    uint8  m_tyreStintsEndLaps[8];
};

struct PacketFinalClassificationData
{
    PacketHeader             m_header;
    uint8                    m_numCars;
    FinalClassificationData  m_classificationData[22];
};
```

---

### 9 — Lobby Info Packet

```c
struct LobbyInfoData
{
    uint8  m_aiControlled;
    uint8  m_teamId;          // 255=none selected
    uint8  m_nationality;
    uint8  m_platform;        // 1=Steam,3=PlayStation,4=Xbox,6=Origin,255=unknown
    char   m_name[32];
    uint8  m_carNumber;
    uint8  m_yourTelemetry;   // 0=restricted,1=public
    uint8  m_showOnlineNames;
    uint16 m_techLevel;
    uint8  m_readyStatus;     // 0=not ready,1=ready,2=spectating
};

struct PacketLobbyInfoData
{
    PacketHeader  m_header;
    uint8         m_numPlayers;
    LobbyInfoData m_lobbyPlayers[22];
};
```

---

### 10 — Car Damage Packet

```c
struct CarDamageData
{
    float m_tyresWear[4];            // % [RL,RR,FL,FR]
    uint8 m_tyresDamage[4];          // %
    uint8 m_brakesDamage[4];         // %
    uint8 m_tyreBlisters[4];         // %  ← NEW in F1 25
    uint8 m_frontLeftWingDamage;     // %
    uint8 m_frontRightWingDamage;    // %
    uint8 m_rearWingDamage;          // %
    uint8 m_floorDamage;             // %
    uint8 m_diffuserDamage;          // %
    uint8 m_sidepodDamage;           // %
    uint8 m_drsFault;                // 0=OK,1=fault
    uint8 m_ersFault;                // 0=OK,1=fault
    uint8 m_gearBoxDamage;           // %
    uint8 m_engineDamage;            // %
    uint8 m_engineMGUHWear;          // %
    uint8 m_engineESWear;            // %
    uint8 m_engineCEWear;            // %
    uint8 m_engineICEWear;           // %
    uint8 m_engineMGUKWear;          // %
    uint8 m_engineTCWear;            // %
    uint8 m_engineBlown;             // 0=OK,1=fault
    uint8 m_engineSeized;            // 0=OK,1=fault
};

struct PacketCarDamageData
{
    PacketHeader  m_header;
    CarDamageData m_carDamageData[22];
};
```

---

### 11 — Session History Packet

> Cycles through cars (one car per packet). In a 20-car race, each car gets updated ~once/second.
> After race end, a final bulk update is sent for all vehicles.

```c
struct LapHistoryData
{
    uint32 m_lapTimeInMS;
    uint16 m_sector1TimeMSPart;
    uint8  m_sector1TimeMinutesPart;
    uint16 m_sector2TimeMSPart;
    uint8  m_sector2TimeMinutesPart;
    uint16 m_sector3TimeMSPart;
    uint8  m_sector3TimeMinutesPart;
    uint8  m_lapValidBitFlags;
    // 0x01=lap valid, 0x02=sector1 valid, 0x04=sector2 valid, 0x08=sector3 valid
};

struct TyreStintHistoryData
{
    uint8 m_endLap;              // 255=current tyre
    uint8 m_tyreActualCompound;
    uint8 m_tyreVisualCompound;
};

struct PacketSessionHistoryData
{
    PacketHeader          m_header;
    uint8                 m_carIdx;
    uint8                 m_numLaps;
    uint8                 m_numTyreStints;
    uint8                 m_bestLapTimeLapNum;
    uint8                 m_bestSector1LapNum;
    uint8                 m_bestSector2LapNum;
    uint8                 m_bestSector3LapNum;
    LapHistoryData        m_lapHistoryData[100];
    TyreStintHistoryData  m_tyreStintsHistoryData[8];
};
```

---

### 12 — Tyre Sets Packet

> Cycles through cars. 20 sets per car: 13 dry + 7 wet.

```c
struct TyreSetData
{
    uint8 m_actualTyreCompound;
    uint8 m_visualTyreCompound;
    uint8 m_wear;                  // %
    uint8 m_available;
    uint8 m_recommendedSession;    // See appendix
    uint8 m_lifeSpan;              // Laps remaining
    uint8 m_usableLife;            // Max recommended laps
    int16 m_lapDeltaTime;          // ms vs fitted set
    uint8 m_fitted;
};

struct PacketTyreSetsData
{
    PacketHeader m_header;
    uint8        m_carIdx;
    TyreSetData  m_tyreSetData[20];
    uint8        m_fittedIdx;
};
```

---

### 13 — Motion Ex Packet

Extended physics data for the player's car only (for motion platforms).

```c
struct PacketMotionExData
{
    PacketHeader m_header;
    // All wheel arrays: [RL, RR, FL, FR]
    float m_suspensionPosition[4];
    float m_suspensionVelocity[4];
    float m_suspensionAcceleration[4];
    float m_wheelSpeed[4];
    float m_wheelSlipRatio[4];
    float m_wheelSlipAngle[4];
    float m_wheelLatForce[4];
    float m_wheelLongForce[4];
    float m_heightOfCOGAboveGround;
    float m_localVelocityX;         // m/s
    float m_localVelocityY;
    float m_localVelocityZ;
    float m_angularVelocityX;       // rad/s
    float m_angularVelocityY;
    float m_angularVelocityZ;
    float m_angularAccelerationX;   // rad/s²
    float m_angularAccelerationY;
    float m_angularAccelerationZ;
    float m_frontWheelsAngle;       // radians
    float m_wheelVertForce[4];
    float m_frontAeroHeight;        // Front plank edge height above road
    float m_rearAeroHeight;         // Rear plank edge height above road
    float m_frontRollAngle;         // ← NEW in F1 25
    float m_rearRollAngle;          // ← NEW in F1 25
    float m_chassisYaw;             // Yaw relative to direction of motion (rad)
    float m_chassisPitch;           // Pitch relative to direction of motion (rad) ← NEW in F1 25
    float m_wheelCamber[4];         // radians ← NEW in F1 25
    float m_wheelCamberGain[4];     // radians (active - dynamic camber) ← NEW in F1 25
};
```

---

### 14 — Time Trial Packet

Only sent in Time Trial mode.

```c
struct TimeTrialDataSet
{
    uint8  m_carIdx;
    uint8  m_teamId;
    uint32 m_lapTimeInMS;
    uint32 m_sector1TimeInMS;
    uint32 m_sector2TimeInMS;
    uint32 m_sector3TimeInMS;
    uint8  m_tractionControl;       // 0=off,1=on
    uint8  m_gearboxAssist;         // 0=off,1=on
    uint8  m_antiLockBrakes;        // 0=off,1=on
    uint8  m_equalCarPerformance;   // 0=Realistic,1=Equal
    uint8  m_customSetup;           // 0=No,1=Yes
    uint8  m_valid;                 // 0=invalid,1=valid
};

struct PacketTimeTrialData
{
    PacketHeader      m_header;
    TimeTrialDataSet  m_playerSessionBestDataSet;
    TimeTrialDataSet  m_personalBestDataSet;
    TimeTrialDataSet  m_rivalDataSet;
};
```

---

### 15 — Lap Positions Packet

> Max 50 laps per packet. If >50 laps, two packets with different `m_lapStart` values.

```c
struct PacketLapPositionsData
{
    PacketHeader m_header;
    uint8        m_numLaps;
    uint8        m_lapStart;    // 0-indexed start lap
    uint8        m_positionForVehicleIdx[50][22];  // 0=no record
};
```

---

## Restricted Data (Your Telemetry Setting)

When a player sets telemetry to **Restricted**, these fields are zeroed for other players:

**Car Status Packet:** `m_fuelInTank`, `m_fuelCapacity`, `m_fuelMix`, `m_fuelRemainingLaps`, `m_frontBrakeBias`, `m_ersDeployMode`, `m_ersStoreEnergy`, `m_ersDeployedThisLap`, `m_ersHarvestedThisLapMGUK`, `m_ersHarvestedThisLapMGUH`, `m_enginePowerICE`, `m_enginePowerMGUK`

**Car Damage Packet:** `m_frontLeftWingDamage`, `m_frontRightWingDamage`, `m_rearWingDamage`, `m_floorDamage`, `m_diffuserDamage`, `m_sidepodDamage`, `m_engineDamage`, `m_gearBoxDamage`, `m_tyresWear[4]`, `m_tyresDamage[4]`, `m_brakesDamage[4]`, `m_drsFault`, `m_engineMGUHWear`, `m_engineESWear`, `m_engineCEWear`, `m_engineICEWear`, `m_engineMGUKWear`, `m_engineTCWear`

**Tyre Sets Packet:** All data for player car.

---

## FAQs

### How to enable UDP output
In-game: **Options → Settings → UDP Telemetry** (bottom of list).
Configure: IP, port, broadcast mode, send rate.

**XML config** (PC only, after first boot):
```
...\Documents\My Games\<game_folder>\hardwaresettings\hardware_settings_config.xml
```
```xml
<motion>
  <udp enabled="false" broadcast="false" ip="127.0.0.1" port="20777"
       sendRate="20" format="2025" yourTelemetry="restricted" onlineNames="off" />
</motion>
```
> Default port: **20777**

### Backward compatibility
F1 25 supports the previous **2 UDP formats**. Set `UDP Format` to `2024` or `2023` in-game.

### Wheel array order
```
Index 0 = Rear Left  (RL)
Index 1 = Rear Right (RR)
Index 2 = Front Left (FL)
Index 3 = Front Right(FR)
```

### Vehicle indices
Vehicle indices are assigned at session start and **never change** during the session.

### What changed from F1 24?
- Stop-go penalty time added to Event packet
- Tyre blister percentage added to Car Damage packet
- Chassis pitch added to Motion Ex packet
- Car colours added to Participants packet (name reduced from 48 to 32 chars)
- Wheel camber and wheel camber gain added to Motion Ex packet
- More detailed reason for DRS disabled
- Retirement reason added to Retirement event
- New Lap Positions packet
- Result reason added to Final Classifications packet
- C6 compound tyre added to documentation

---

## Appendices

### Team IDs

| ID  | Team                     | ID  | Team                  |
|-----|--------------------------|-----|-----------------------|
| 0   | Mercedes                 | 154 | APXGP '25             |
| 1   | Ferrari                  | 155 | Konnersport '24       |
| 2   | Red Bull Racing          | 158 | Art GP '24            |
| 3   | Williams                 | 159 | Campos '24            |
| 4   | Aston Martin             | 160 | Rodin Motorsport '24  |
| 5   | Alpine                   | 161 | AIX Racing '24        |
| 6   | RB                       | 162 | DAMS '24              |
| 7   | Haas                     | 163 | Hitech '24            |
| 8   | McLaren                  | 164 | MP Motorsport '24     |
| 9   | Sauber                   | 165 | Prema '24             |
| 41  | F1 Generic               | 166 | Trident '24           |
| 104 | F1 Custom Team           | 167 | Van Amersfoort '24    |
| 129 | Konnersport              | 168 | Invicta '24           |
| 142 | APXGP '24                | 185 | Mercedes '24          |
|     |                          | 186 | Ferrari '24           |
|     |                          | 187 | Red Bull Racing '24   |
|     |                          | 188 | Williams '24          |
|     |                          | 189 | Aston Martin '24      |
|     |                          | 190 | Alpine '24            |
|     |                          | 191 | RB '24                |
|     |                          | 192 | Haas '24              |
|     |                          | 193 | McLaren '24           |
|     |                          | 194 | Sauber '24            |

---

### Driver IDs

| ID  | Driver               | ID  | Driver               | ID  | Driver                  |
|-----|----------------------|-----|----------------------|-----|-------------------------|
| 0   | Carlos Sainz         | 62  | Alexander Albon      | 164 | Joshua Dürksen          |
| 2   | Daniel Ricciardo     | 70  | Rashid Nair          | 165 | Andrea-Kimi Antonelli   |
| 3   | Fernando Alonso      | 71  | Jack Tremblay        | 166 | Ritomo Miyata           |
| 4   | Felipe Massa         | 77  | Ayrton Senna         | 167 | Rafael Villagómez       |
| 7   | Lewis Hamilton       | 80  | Guanyu Zhou          | 168 | Zak O'Sullivan          |
| 9   | Max Verstappen       | 83  | Juan Manuel Correa   | 169 | Pepe Marti              |
| 10  | Nico Hülkenburg      | 90  | Michael Schumacher   | 170 | Sonny Hayes             |
| 11  | Kevin Magnussen      | 94  | Yuki Tsunoda         | 171 | Joshua Pearce           |
| 14  | Sergio Pérez         | 102 | Aidan Jackson        | 172 | Callum Voisin           |
| 15  | Valtteri Bottas      | 109 | Jenson Button        | 173 | Matias Zagazeta         |
| 17  | Esteban Ocon         | 110 | David Coulthard      | 174 | Nikola Tsolov           |
| 19  | Lance Stroll         | 112 | Oscar Piastri        | 175 | Tim Tramnitz            |
| 50  | George Russell       | 113 | Liam Lawson          | 185 | Luca Cortez             |
| 54  | Lando Norris         | 116 | Richard Verschoor    |     |                         |
| 58  | Charles Leclerc      | 123 | Enzo Fittipaldi      |     |                         |
| 59  | Pierre Gasly         | 125 | Mark Webber          |     |                         |
|     |                      | 126 | Jacques Villeneuve   |     |                         |
|     |                      | 132 | Logan Sargeant       |     |                         |
|     |                      | 136 | Jack Doohan          |     |                         |
|     |                      | 147 | Oliver Bearman       |     |                         |
|     |                      | 148 | Jak Crawford         |     |                         |
|     |                      | 149 | Isack Hadjar         |     |                         |
|     |                      | 161 | Gabriel Bortoleto    |     |                         |
|     |                      | 162 | Franco Colapinto     |     |                         |

---

### Track IDs

| ID | Track              | ID | Track                  |
|----|--------------------|----|------------------------|
| 0  | Melbourne          | 19 | Mexico                 |
| 2  | Shanghai           | 20 | Baku (Azerbaijan)      |
| 3  | Sakhir (Bahrain)   | 26 | Zandvoort              |
| 4  | Catalunya          | 27 | Imola                  |
| 5  | Monaco             | 29 | Jeddah                 |
| 6  | Montreal           | 30 | Miami                  |
| 7  | Silverstone        | 31 | Las Vegas              |
| 9  | Hungaroring        | 32 | Losail                 |
| 10 | Spa                | 39 | Silverstone (Reverse)  |
| 11 | Monza              | 40 | Austria (Reverse)      |
| 12 | Singapore          | 41 | Zandvoort (Reverse)    |
| 13 | Suzuka             |    |                        |
| 14 | Abu Dhabi          |    |                        |
| 15 | Texas              |    |                        |
| 16 | Brazil             |    |                        |
| 17 | Austria            |    |                        |

---

### Session Types

| ID | Type                    | ID | Type                      |
|----|-------------------------|----|---------------------------|
| 0  | Unknown                 | 10 | Sprint Shootout 1         |
| 1  | Practice 1              | 11 | Sprint Shootout 2         |
| 2  | Practice 2              | 12 | Sprint Shootout 3         |
| 3  | Practice 3              | 13 | Short Sprint Shootout     |
| 4  | Short Practice          | 14 | One-Shot Sprint Shootout  |
| 5  | Qualifying 1            | 15 | Race                      |
| 6  | Qualifying 2            | 16 | Race 2                    |
| 7  | Qualifying 3            | 17 | Race 3                    |
| 8  | Short Qualifying        | 18 | Time Trial                |
| 9  | One-Shot Qualifying     |    |                           |

---

### Game Mode IDs

| ID  | Mode                        |
|-----|-----------------------------|
| 4   | Grand Prix '23              |
| 5   | Time Trial                  |
| 6   | Splitscreen                 |
| 7   | Online Custom               |
| 15  | Online Weekly Event         |
| 17  | Story Mode (Braking Point)  |
| 27  | My Team Career '25          |
| 28  | Driver Career '25           |
| 29  | Career '25 Online           |
| 30  | Challenge Career '25        |
| 75  | Story Mode (APXGP)          |
| 127 | Benchmark                   |

---

### Ruleset IDs

| ID | Ruleset               |
|----|-----------------------|
| 0  | Practice & Qualifying |
| 1  | Race                  |
| 2  | Time Trial            |
| 12 | Elimination           |

---

### Surface Types

| ID | Surface      |
|----|--------------|
| 0  | Tarmac       |
| 1  | Rumble strip |
| 2  | Concrete     |
| 3  | Rock         |
| 4  | Gravel       |
| 5  | Mud          |
| 6  | Sand         |
| 7  | Grass        |
| 8  | Water        |
| 9  | Cobblestone  |
| 10 | Metal        |
| 11 | Ridged       |

---

### Button Flags

| Bit Flag     | Button            |
|--------------|-------------------|
| 0x00000001   | Cross / A         |
| 0x00000002   | Triangle / Y      |
| 0x00000004   | Circle / B        |
| 0x00000008   | Square / X        |
| 0x00000010   | D-pad Left        |
| 0x00000020   | D-pad Right       |
| 0x00000040   | D-pad Up          |
| 0x00000080   | D-pad Down        |
| 0x00000100   | Options / Menu    |
| 0x00000200   | L1 / LB           |
| 0x00000400   | R1 / RB           |
| 0x00000800   | L2 / LT           |
| 0x00001000   | R2 / RT           |
| 0x00002000   | Left Stick Click  |
| 0x00004000   | Right Stick Click |
| 0x00008000   | Right Stick Left  |
| 0x00010000   | Right Stick Right |
| 0x00020000   | Right Stick Up    |
| 0x00040000   | Right Stick Down  |
| 0x00080000   | Special           |
| 0x00100000   | UDP Action 1      |
| 0x00200000   | UDP Action 2      |
| 0x00400000   | UDP Action 3      |
| 0x00800000   | UDP Action 4      |
| 0x01000000   | UDP Action 5      |
| 0x02000000   | UDP Action 6      |
| 0x04000000   | UDP Action 7      |
| 0x08000000   | UDP Action 8      |
| 0x10000000   | UDP Action 9      |
| 0x20000000   | UDP Action 10     |
| 0x40000000   | UDP Action 11     |
| 0x80000000   | UDP Action 12     |

---

### Penalty Types

| ID | Meaning                                          |
|----|--------------------------------------------------|
| 0  | Drive through                                    |
| 1  | Stop Go                                          |
| 2  | Grid penalty                                     |
| 3  | Penalty reminder                                 |
| 4  | Time penalty                                     |
| 5  | Warning                                          |
| 6  | Disqualified                                     |
| 7  | Removed from formation lap                       |
| 8  | Parked too long timer                            |
| 9  | Tyre regulations                                 |
| 10 | This lap invalidated                             |
| 11 | This and next lap invalidated                    |
| 12 | This lap invalidated without reason              |
| 13 | This and next lap invalidated without reason     |
| 14 | This and previous lap invalidated                |
| 15 | This and previous lap invalidated without reason |
| 16 | Retired                                          |
| 17 | Black flag timer                                 |

---

### Infringement Types

| ID | Meaning                                          |
|----|--------------------------------------------------|
| 0  | Blocking by slow driving                         |
| 1  | Blocking by wrong way driving                    |
| 2  | Reversing off the start line                     |
| 3  | Big Collision                                    |
| 4  | Small Collision                                  |
| 5  | Collision failed to hand back position (single)  |
| 6  | Collision failed to hand back position (multiple)|
| 7  | Corner cutting gained time                       |
| 8  | Corner cutting overtake single                   |
| 9  | Corner cutting overtake multiple                 |
| 10 | Crossed pit exit lane                            |
| 11 | Ignoring blue flags                              |
| 12 | Ignoring yellow flags                            |
| 13 | Ignoring drive through                           |
| 14 | Too many drive throughs                          |
| 15 | Drive through reminder serve within n laps       |
| 16 | Drive through reminder serve this lap            |
| 17 | Pit lane speeding                                |
| 18 | Parked for too long                              |
| 19 | Ignoring tyre regulations                        |
| 20 | Too many penalties                               |
| 21 | Multiple warnings                                |
| 22 | Approaching disqualification                     |
| 23 | Tyre regulations select single                   |
| 24 | Tyre regulations select multiple                 |
| 25 | Lap invalidated corner cutting                   |
| 26 | Lap invalidated running wide                     |
| 27 | Corner cutting ran wide gained time minor        |
| 28 | Corner cutting ran wide gained time significant  |
| 29 | Corner cutting ran wide gained time extreme      |
| 30 | Lap invalidated wall riding                      |
| 31 | Lap invalidated flashback used                   |
| 32 | Lap invalidated reset to track                   |
| 33 | Blocking the pitlane                             |
| 34 | Jump start                                       |
| 35 | Safety car to car collision                      |
| 36 | Safety car illegal overtake                      |
| 37 | Safety car exceeding allowed pace                |
| 38 | Virtual safety car exceeding allowed pace        |
| 39 | Formation lap below allowed speed                |
| 40 | Formation lap parking                            |
| 41 | Retired mechanical failure                       |
| 42 | Retired terminally damaged                       |
| 43 | Safety car falling too far back                  |
| 44 | Black flag timer                                 |
| 45 | Unserved stop go penalty                         |
| 46 | Unserved drive through penalty                   |
| 47 | Engine component change                          |
| 48 | Gearbox change                                   |
| 49 | Parc Fermé change                                |
| 50 | League grid penalty                              |
| 51 | Retry penalty                                    |
| 52 | Illegal time gain                                |
| 53 | Mandatory pitstop                                |
| 54 | Attribute assigned                               |

---

*F1® 25 Game — an official product of the FIA Formula One World Championship™. © 2025*
