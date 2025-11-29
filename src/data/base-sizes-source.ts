const BASE_SIZE_SOURCE = {
  "25 mm": [
    "Unaugmented humans in sub-flak and flak armour (Guardsman, Tempestus Scion, Solar Auxilia, Traitor Guardsman, Cultist, Ruinstorm Possessed Auxiliary (suggested), Hive Scum / Brood Scum, Neophyte Genestealer Hybrid), Arco-flagellant, Autosavant, Skitarii Ranger / Vanguard, Secutarii Hoplite / Peltast, Ratling, Servitor / Technomedic Servitor / Breacher Servitor / Auto-Proxy Servitor, Tech-thrall / Tech-thrall Certus, Servo-automata, CORV / E-COG, Servo skull / Tome-skull, Teleport Homer, Cherubim, Dog / Aximillion, Cyber-Mastiff / Macula, Rantal-class Venatus Reclamator / R-VR, Cawdor Bomb Delivery Rat",
    "Techmite Oculi, Techmite Autoveyer, Mole grenade",
    "Blue Horror, Brimstone Horrors, Poxwalker, Vox-Shambler, Mutoid Vermin (Sludge-Grub, Cursemite, Glitchling, Eyestinger Swarm), Daemonette / Herald of Slaanesh, The Masque, Daemonhost, Hamadrya, Accursed Cultist Mutant",
    "Kabalite Warrior (expected to move to 28mm), Wych (expected to move to 28mm), Wrack (expected to move to 28mm), Harlequin Player (expected to move to 28mm), Aspect shrine token",
    "Gretchin / Grot Oiler / Grot Orderly / Grot Ammo Runt, Attack / Bomb Squig",
    "Neurogaunt, Spore Mine (Poison / Frag / Bio-Acid), Neuroloid, Genestealer Familiar",
    "Tau Fire Warrior / Breacher / Pathfinder, Oversight drone",
    "Jokaero, Caryatid / Caryatid Prime, Watcher in the Dark, Spindle Drone, Phelynx, Psychoterric Wyrm, Borewyrm infestation, Arthromite Spinewyrm, Sheen Bird, Malstrain Tyramite"
  ],
  "28 mm": [
    "Sister Repentia, Sister Novitiate, Astartes Scout/Primaris Neophyte, Gaunt's Ghosts (Colonel-Commissar Ibram Gaunt, Colonel Colm Corbec, Major Elim Rawne, Master Sniper Hlaine Larkin, 'Try Again' Bragg, Sergeant Scout Oan Mkoll), Cadian Command Squad (Cadian commander, Veteran guardsman), Kasrkin, Tempestus Aquilon, Adeptus Arbites, Imperial Navy Navis Gunner / Endurant, Sha'dar Hunter, Cenobyte Servitor",
    "Hearthkyn Warrior, Cthonian Beserk, Ironkin Assistant, Ironhead Squat Prospector, Techmite Exovator 078b",
    "Dark Commune Blessed Blade, Jakhal cultist",
    "Guardian Defender / Storm Guardian, Howling Banshee, Dark Reaper, Dire Avenger, Striking Scorpion, Fire Dragon, Striking Scorpion, Shadow Spectre, Warp Spider, Ranger, Corsair Reaver / Voidscarred, Incubus / Klaivex, Mandrake (Nightfiend / Abyssal / Chooser of the Flesh / Dirgemaw / Shadeweaver)",
    "Flayed One, Canoptek Plasmacyte",
    "Termagaunt / Hormagaunt, Neurogaunt Nodebeast",
    "Kroot Carnivore / Long-quill / Farstalker, Kroot Hound, Vespid Stingwing (Strain leader / Shadestrain / Longsting / Skyblast / Swarmguard / Warrior)"
  ],
  "32 mm": [
    "(AKA the small flying base)",
    "Humans in power / artificer armour (Sister of Battle / Dominion / Seraphim / Zephyrim / Palatine / Dogmata / Celestian Sacresant, Repentia Superior, Novitiate Superior, Celestian Insidiant, Sister of Silence Prosecutor / Vigilator / Witchseeker, Inquisitor, Techpriest Enginseer, Macrotek Enginseer, Cybernetica Datasmith), Electro-Priest Fulgurite / Corpuscarii, Gun Servitor / X-101, Van Saar Neotek on grav-cutter, Brôkhyr Iron-master, Einhyr Hearthguard, Spyrer in Yeld / Malcadon / Jakara / Sovereign hunting rig",
    "Astartes Firstborn Tactical / Assault / Devastator Marine, Astartes Firstborn Sternguard / Vanguard Veteran, Astartes Pimaris Intercessor / Assault Intercessor / Sternguard Veteran / Hellblaster / Reiver / Infiltrator / Incursor / Desolation Marine / Infernus Marine",
    "Ironhead Squat Exo-kyn, Memnyr Strategist, Arkanyst Evaluator",
    "Chaos Astartes (Chosen, Fallen, Khorne Berzerker, Rubric Marine, Plague Marine, Murderwing Raptor / Warp Talon), Negavolt Cultist, Goremonger, Bloodletter / Herald of Khorne, Flamer of Tzeench, Screamer of Tzeentch, Pink Horror / Herald of Tzeench, Beastman (Ironhorn, Deathknell, Fluxbray, Shaman, Vandal) / Tzaangor, Plaguebearer / Herald of Nurgle, Fury, Ruinstorm Daemon Chosen (suggested), Ruinstorm Lesser Daemon (suggested), Ruinstorm Possessed Legionary (suggested)",
    "Swooping Hawk, Windrider / Skyrunner / Corsair Cloud Dancer, Reaver, Hellion / Beastmaster, Scourge, The Visarch Sword of Ynnead, Lelith Hesperax",
    "Painboy, Wurrboy, Mek, Runtherd, Boss Nob, Ork Boy / Beast Snagga Boy / Stormboy / Loota Boy / Burna Boy / Kommando / Tankbusta / Wrecka",
    "Genestealer, Gargoyle, Acolyte Genestealer Hybrid, Hybrid Metamorph / Kellermorph, Genestealer Aberrant / Hypermorph",
    "Royal Warden, Plasmancer, Cryptothrall, Necron Warrior, Immortal / Deathmark, Lychguard / Triarch Praetorian, Tomb Blade",
    "XV25 Stealth armour, most drones (MV1 Gun, MV4 Shield, MV5 Stealth, MV7 Marker, MV8 Missile, MV17 Interceptor, MV31 Pulse Accelerator, MV33 Grav-Inhibitor, MV36 Guardian, M37 Advanced Guardian, MV52 Shield, MV62 Command-link, MV71 Sniper, MV84 Shielded Missile, MB3 Recon, DX4 Technical, Blacklight Marker, Heavy Gun), Kroot Kill-broker, Kroot War Shaper / Flesh Shaper / Trail Shaper",
    "Man of Iron / UR-025, Phyrr Cat, Millisaur, Cyberarachnid, Ripperjack, macro-grapplehawk / Terror's Shadow"
  ],
  "40 mm": [
    "Ogryn / Bullgryn, Human in Terminator armour, Lady Haera, Krieg death rider, Celestine the Living Saint, Sicaran Ruststalker / Infiltrator, Sydonian Skatros, Pteraxii Skystalker / Sterylizor, Archmagos / Archmagos Prime / Archmagos Draykavac, Mechanicum Magos Dominus, Myrmidon Secutor / Myrmidon Destructor, Thallax / Ursarax, Scyllax, Luther Pattern Excavation Automata \"Ambot\", 'Sanctioner' Pattern Automata, Van Saar Arachni-rig, Astra Militarum scanner (OOP), Krieg engineers with mole launcher, Krieg weapon team with heavy flamer, Fire Wasp drone (suggested), Stig-shambler, Astartes Terminator (Paladin / Deathwing Knight) / Librarian in Indomitus / Cataphractii / Tartaros / Aegis Terminator armour, Wulfen, 30k-era Primarchs (Lion El'Jonson, Fulgrim, Perturabo, Jaghatai Khan, Leman Russ, Rogal Dorn, Konrad Curze, Sanguinius, Ferrus Manus, Angron, Roboute Guilliman, Mortarion, Magnus, Horus, Lorgar, Vulkan, Corvus Corax, Alpharius), Astartes Primaris Captain / Lieutenant / Ancient / Chaplain / Judicar / Apothecary / Apothecary Biologis / Techmarine, Inceptor / Supressor, Aggressor / Eradicator, Heavy Intercessor, Eliminator, Vitrix Guard, Bladeguard Veteran/Ancient, Custodian Guard / Custodian Wardens / Sagittarum Guard / Shield-Captain / Vexilus Praetor / Captain-General Trajann Valoris, Allarus Custodians / Shield-Captain or Vexilus Praetor in Allarus Terminator Armour, Custodian Venatari, Spyrer in Orrus hunting rig, Lady Haera Helmawr in Sthenian hunting rig, Aquilon servo-sentry, Krieg remote mine",
    "Kâhl / Ûthar the Destined, Einhyr Champion, Grimnyr, Buri Aegnirssen, Brôkhyr Thunderkyn, Ironkin Steeljack",
    "Chaos Lord, Master of Possession, Lord of Poxes, Noxious Blightbringer, Haarken Worldclaimer, Astartes Possessed / Greater Possessed / Eightbound / Exalted Eightbound / Gal Vorbak, Havoc, Noise Marine, Flawless Blade, Exalted Sorcerer on a Disc of Tzeench / Fluxmaster / Herald on a Disc of Tzeench, Nightmare Hulk / Gnasher-Screamer / Vulgrar Thrice-Cursed, Sekhetar Robot, Accursed Cultist Torment, Jackal Dishonoured, Mutilator, Ruinstorm Daemon Beast (suggested), Skulltaker, The Changeling, Nurglings, Ruinstorm Daemon Swarm (suggested)",
    "Asuryani heavy weapons platform, Wraithguard / Wraithblade, Grotesque, Asurmen, Jain Zar, Maugan Ra, Fuegan, Baharroth, Lhykhis, Drazhar",
    "Warboss, Big Mek, Weirdboy, Painboss, Meganob / Big Mek in Mega-Armour, Wrecka Boss Nob, Flash Git, Boss Snikrot, Da Red Gobbo on Bounca, Snotling swarm",
    "Ravener, Zoanthrope / Neurothrope / Venomthrope, Barbgaunt, Von Ryan’s Leaper, Mucolid Spore, Mieotic Spore Sack, Rippers / Sky Slashers, Parasite of Mortrex, Abominant with a mindwyrm familiar, Malstrain Genestealer",
    "Necron Overlord, Psychomancer / Chronomancer, C'Tan Shard of the Deceiver / Nightbringer, Canoptek Acanthrite, Canoptek Scarab Swarm",
    "Tau sniper drone controller, DS8 tactical support turret, Ethereal on hover drone",
    "Sslyth, Khymerae, Clawed Fiend, Sumpkroc, Piscean Spektor, Fenrisian Wolf / Cyberwolf, Khimerix, Razorwing flock, Wasteland Giant Rat, Servant of the Silent Ones",
    "Warhammer 40000 objectives (suggested)"
  ],
  "50 mm": [
    "Astra Militarum Heavy Weapon Team, Tech-Priest Dominus, Tech-Priest Manipulus, Astartes Captain in Terminator Armour / Belial, Asmodai, Astartes Firstborn in Centurion Assault / Devastator warsuit, Astartes in Saturnine Terminator Armour, Marneus Calgar in Armour of Heraclus, Horus Ascended, Custodes Aquilon Terminator, Penitent Engine / Mortifier / Anchorite, Junith Eruita on Pulpit of Saint Holline’s Basilica, Celestan in Paragon Warsuit, Hospitaller, Vartijan Exo-Driller, Chtonian Beserk with a mole grenade launcher and an L-COG loader",
    "Chaos Spawn, Obliterator, Ruinstorm Daemon Brute (suggested), Death Guard Lord of Contagion in Terminator armour, Slaughterbound, Syll’Esske",
    "Warboss/Ufthak Blackhawk,Warboss in Mega Armour, Beastboss, Zodgrod Wortsnagga, Big Mek",
    "Technomancer on a Canoptek Scarab, Skorpekh / Ophydian / Hexmark Destroyer, Canoptek Wraith, Triarchal Menhir",
    "Winged Tyranid Prime, Neurotyrant, Tyranid Warrior, Patriarch, Hive Guard / Tyrant Guard, Lictor / Neurolictor",
    "XV8 Crisis, Commander Shadowsun in XV22 Stalker battlesuit, Krootox / Krootox Rider / Krootox Rampager",
    "Ambull, Zoat, Guardian Drone, Ash Wastes Arachni-rig"
  ],
  "65 mm (Frequently mislabeled as 60mm, AKA the large flying base)": [
    "Hermes Light / Veletaris Sentinel, Drop Sentinel (OOP), Support Sentinel (OOP), Sentinel Powerlifter (OOP), Kastellan robots, Domitar(Conqueror) / Domitar-Ferrum, Castellax, Vorax type battle-automata, Kataphron Breacher / Destroyer battle servitor, Magos / Archmagos / Archmagos Draykavac on Abeyant, Morvenn Vahl in Purgator Mirabilis warsuit, Castraferrum (OOP), Castraferrum Ironclad (OOP), Contemptor, Contemptor-Galatus, Contemptor-Achillus type Dreadnoughts, Land Speeder Tornado (OOP) / Typhoon (OOP) / Storm (OOP) / Tempest (OOP), Land Speeder Vengeance / Ravenwing Darkshroud, Javelin Attack Speeder, Proteus Pattern Land Speeder, Scimitar jetbike, Sammael on Corvex jetbike, 40k-era Primarch Guilliman, High Marshal Helbrecht, Throne of Judgement, Tallarn Mukaali rider (OOP), Thunderfolf Cavalry, Atalan Wolfquad",
    "Helbrute, Decimator, Daemon Prince, Ruinstorm Daemon Shrike (suggested), 40k-era Abaddon the Despoiler, The Blue Scribes, Epidemius, Beast of Nurgle, Foetid Bloat-drone, Greater Blight Drone, Plague Drone of Nurgle",
    "Wraithlord / Wraithseer, War Walker / Wasp Assault Walker, Wave Serpent / Falcon / Fire Prism / Night Spinner, Vyper, Hornet, Shining Spear, Shroud Runner, Raider / Ravager / Reaper, Venom, Talos / Chronos, Starweaver / Voidweaver, Skyweaver",
    "Deff Dread, Killa Kan",
    "Hive Tyrant, Carnifex, Malanthrope, Deathleaper",
    "Skorpekh Lord, Canoptek Reanimator, Ghost / Doomsday Ark, Catacomb Command Barge / Annihilation Barge, Tesseract Ark, Canoptek Spyder, Lokhust Destroyer / Lokhust Heavy Destroyer / Lokhust Destroyer Lord, Transcendent C'Tan",
    "TY7 Devilfish / TX7 Hammerhead / TX78 Sky Ray, TX4 Piranha / Piranha TX-42, Tetra, DX-6 Remora, XV85 Enforcer, XV86 Coldstar, XV88 Broadside, XV9 Hazard / Shas'o R'alai, Commander Farsight in XV86 Supernova battlesuit, Kroot Knarloc rider (OOP), Great Knarloc (OOP) / Goaded Great Knarloc (OOP)"
  ],
  "80 mm": [
    "Armoured / Scout Sentinel, Aethon Heavy Sentinel, Deredeo Dreadnought, Leviathan Dreadnought, Firestrike Servo-turret, Lord Solar Arcadian Leontus on Konstantin cyber-steed",
    "Cthonian Earthshaker",
    "Myphitic Blight-hauler, Vashtorr the Arkifane",
    "Avatar of Khaine, The Yncarne Avatar of Ynnead",
    "Ghazghkull Mag Uruk Thraka, Mozrog Skragbad on Big Chompa / Beastboss on Squigosaur",
    "Illuminor Szeras, C'tan Shard of the Void Dragon",
    "Biovore / Pyrovore"
  ],
  "90 mm": [
    "Redemptor / Brutalis / Ballistus Dreadnought, Invictor Tactical Warsuit, Storm Speeder Hammerstrike / Hailstrike / Thunderstrike",
    "Canoptek Doomstalker",
    "Screamer-Killer"
  ],
  "100 mm": [
    "Field Ordnance Battery with bombast field gun / heavy lascannon / malleus rocket launcher, Knight Armiger Warglaive / Helverin / Moirax, Repulsor / Repulsor Executioner / Impulsor, Gladiator Valiant / Lancer / Reaper, Saturnine Dreadnought, Telemon Heavy Dreadnought, Anacharis Scoria",
    "Lord of Change (GW plastic) / Kairos Fateweaver, Keeper of Secrets (GW plastic) / Shalaxi Helbane, Ruinstorm Greater Daemon Beast (suggested), Skarbrand, Be'lakor the Dark Master, War Dog Karnivore / Brigand / Huntsman, Venomcrawler, Gigantic Chaos Spawn, Daemon Primarch Magnus / Mortarion / Angron / Fulgrim Transfigured",
    "Norn Emissary / Norn Assimilator, Sporocyst",
    "Szarekh the Silent King on Dais of Dominion"
  ],
  "127 mm (Unique Forgeworld resin base)": [
    "Barbed / Scythed Hierodule"
  ],
  "130 mm": [
    "Artillery team (heavy mortar / siege cannon / heavy quad launcher / multiple rocket launcher)",
    "Onager Dunecrawler",
    "Ruinstorm Daemon Lord (suggested), Ruinstorm Greater Daemon (suggested), Great Unclean One / Rotigus, Bloodthirster (Forgeworld), Lord of Change (Forgeworld)"
  ],
  "160 mm": [
    "Astraeus super-heavy tank, Orion Assault Dropship / Ares Gunship",
    "Monolith",
    "KX139 Ta'unar supremacy armour, Tiger Shark AX-1-0 / AX-2-2 (OOP)"
  ],
  "60x35 mm": [
    "Astra Militarum Rough Rider / Death Rider, Serberys Raider / Sulphurhound, Skitarii Ranger / Vanguard with transuranic arquebus",
    "Atalan Jackal / Jackal Alphus, Escher Cutter, Cawdor Ridge Walker",
    "Warpsmith, Flesh Hound of Khorne, Seeker of Slaanesh, Infernal Enrapturess",
    "Yvraine Emissary of Ynnead"
  ],
  "75x42 mm": [
    "Lord Marshal Dreir on ES819",
    "Firstborn Space Marine on a bike (OOP), Vertus Praetors / Shield-Captain on Dawneagle Jetbike, Custodian on Agamatus jetbike, Dustback Helamite / Wy'tari Stormcaller",
    "Chaos Space Marine Biker, Karanak the Hound of Khorne, Exalted Flamer of Tzeentch, Fiend of Slaanesh, The Contorted Epitome",
    "Ork Warbiker / Nob on Warbike, Squighog Boy, Deffkopta",
    "Broodlord"
  ],
  "90x52 mm": [
    "Outrider / Astartes Primaris character on Raider-pattern bike, Hernkyn Pioneer on Magna-Coil Bike, Goliath Mauler",
    "Svenotar Scout Trike",
    "Juggernaut / Bloodcrusher / Skullmaster / Lord Invocatus / Heretic Astartes on Juggernaut",
    "Nob on Smasha Squig",
    "Kroot Lone-spear on a Kalamandra",
    "Freki and Geri the wolf-kin of Russ, Arthromite Duneskuttler"
  ],
  "105x70 mm": [
    "Ironstrider Ballistarius / Cydonian Dragoon, Belisarius Cawl, Pallas Grav-attack",
    "Kapricus Defender / Carrier",
    "Keeper of Secrets (Forgeworld), Horticulous Slimux on Mulch",
    "XV95 Ghostkeel"
  ],
  "120x92 mm": [
    "(AKA the flyer base)",
    "Thanatar-Cavas / Thanatar-Calix / Thanatar-Cynis, Dreadknight, Logan Grimnar on Stormrider, The Triumph of Saint Katherine, Achilles Ridgerunner, Arvus Lighter, Aquila Lander (OOP), Valkyrie Assault Carrier / Valkyrie Sky Talon / Vendetta Gunship / Vulture Gunship, Lightning / Lightning Strike (OOP) / Voss pattern Lightning Strike Fighter, Avenger Strike Fighter, Thunderbolt Heavy Fighter, Stormtalon Gunship / Stormhawk Interceptor, Xiphon pattern Interceptor, Caestus Assault Ram, Stormraven Gunship, Storm Eagle / Fire Raptor Gunship, Corvus Blackstar, Ravenwing Dark Talon / Nephilim Jetfighter, Stormwolf Assault Craft / Stormfang Gunship",
    "Bloodthirster (GW plastic), Forgefiend / Maulerfiend, Lord Discordant on Helstalker, Bloodthirster, Cor’bax Utterblight, Slaughterbrute / Mutalith Vortex Beast, Bloodthrone / Skull Cannon of Khorne, Burning Chariot of Tzeentch, (Exalted) Seeker Chariot of Slaanesh, Dreadclaw Assault Pod (OOP) / Anvillus pattern Dreadclaw Drop Pod, Heldrake, Hell Blade Fighter, Hell Talon Fighter-Bomber",
    "Wraithknight / Skathach Wraithknight, Tantalus, Hemlock Wraithfighter / Crimson Hunter, Nightwing Interceptor, Phoenix Bomber, Razorwing Jetfighter, Voidraven Bomber, Dark Eldar Raven (OOP)",
    "Dakkajet / Blitza-Bommer / Burna-Bommer / Wazbom Blastajet, Fighta (OOP), Fighta-Bommer (OOP), Warkopta",
    "Trygon / Mawlock, Tyrranofex / Tervigon, Exocrine / Haruspex, Toxicrene / Maleceptor, Psychophage, Dimachaeron, Harpy / Hive Crone",
    "Canoptek Tomb Stalker / Sentinel, Night Scythe / Doom Scythe, Night Shroud Bomber, Tesseract Vault / Obelisk",
    "XV104 Riptide / XV107 R'Varna / XV109 Y'Vahra, AX3 Razorshark Strike Fighter / AX39 Sun Shark Bomber, Barracuda (OOP) / Barracuda AX-5-2"
  ],
  "150x95 mm": [
    "Kustom Boosta-Blasta, Shokkjump Dragsta, Boomdakka Snazzwagon, Megatrakk Scrapjet, Rukkatrukk Squigbuggy, Warboss on a Deffkilla Wartrike"
  ],
  "170x109 mm": [
    "Questoris Knight Paladin / Errant / Preceptor / Crusader / Warden / Gallant / Magaera / Styrix, Cerastus Knight Lancer / Acheron / Atrapos / Castigator, Dominus Knight Castellan / Valiant, Archaeopter Stratoraptor / Transvector / Fusilave, Caladius Grav-tank / Caladius Grav-tank Annihilator, Coronus Grav-carrier, Kharon Pattern Acquisitor",
    "Questoris Knight Abominant / Desecrator / Despoiler / Rampager, Dominus Knight Tyrant, Kytan Daemon Engine, Ka'bandha, Ruinstorm Daemon Behemoth (suggested)",
    "Gorkanaut / Morkanaut, Kill Rig / Hunta Rig",
    "KV128 Stormsurge"
  ],
  "70x25 mm": [
    "(AKA the biker base)",
    "Scout Biker",
    "Renegade Ogryn Hound (OOP), Ruinstorm Daemon Cavalry (suggested)"
  ],
  "95x40 mm (Unique Forgeworld resin base)": [
    "Warboss on warbike"
  ]
} as const;

export default BASE_SIZE_SOURCE;
