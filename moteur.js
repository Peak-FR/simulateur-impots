"use strict";

// CONSTANTES FISCALES 2026

const CONSTANTES = Object.freeze({
  ABATTEMENTSALAIRE: { taux: 0.10, min: 495, max: 14426 },
  ABATTEMENTPENSIONS: { taux: 0.10, min: 442, max: 4321 },

  KMMAXSANSJUSTIFICATIF: 40,

  FRAISREPAS: { domicile: 5.45, plafond: 21.10, forfaitSansJustificatifs: 10.90 },

  TELETRAVAIL: { tauxJour: 2.60, plafond: 580 },

  BAREMEIR2026: [
    { limite: 11600, taux: 0.00 },
    { limite: 29579, taux: 0.11 },
    { limite: 84577, taux: 0.30 },
    { limite: 181917, taux: 0.41 },
    { limite: Infinity, taux: 0.45 },
  ],

  PLAFONDDEMIPART: 1807,

  DECOTE: {
    taux: 0.4525,
    seul: { seuil: 1982, montant: 897 },
    couple: { seuil: 3277, montant: 1483 },
  },

  GARDEENFANT: { plafondExclusif: 3500, plafondAlterne: 1750, taux: 0.50 },

  SERVICESDOMICILE: {
    taux: 0.50,
    plafondBase: 12000,
    majorationEnfant: 1500,
    majoration65Ans: 1500,
    plafondMajoreMax: 15000,
    plafondDependance: 20000,
    plafondAssistanceInfo: 500,
    plafondPetitBricolage: 500,
  },

  DONS: {
    seuilAidePersonnes: 1000,
    tauxAidePersonnes1: 0.75,
    tauxAidePersonnes2: 0.66,
    tauxInteretGeneral: 0.66,
    tauxPartis: 0.66,
    plafondPartis: 15000,
    tauxRecherche: 0.60,
    plafondPctRevenu: 0.20,
  },

  SCOLARITE: { college: 61, lycee: 153, superieur: 183 },

  SYNDICAT: { taux: 0.66, plafondPctSalaireBrut: 0.01 },

  EHPAD: { taux: 0.25, plafondParPersonne: 10000 },

  BAREMEKMMOTO: {
    2: [[3000, 0.395, 0], [6000, 0.099, 891], [Infinity, 0.248, 0]],
    5: [[3000, 0.468, 0], [6000, 0.082, 1158], [Infinity, 0.275, 0]],
    99: [[3000, 0.606, 0], [6000, 0.079, 1583], [Infinity, 0.343, 0]],
  },

  BAREMEKMVELO: [[3000, 0.315, 0], [6000, 0.079, 711], [Infinity, 0.198, 0]],

  BAREMEKMVOITURE: {
    3: [[5000, 0.529, 0], [20000, 0.316, 1065], [Infinity, 0.370, 0]],
    4: [[5000, 0.606, 0], [20000, 0.340, 1330], [Infinity, 0.407, 0]],
    5: [[5000, 0.636, 0], [20000, 0.357, 1395], [Infinity, 0.427, 0]],
    6: [[5000, 0.665, 0], [20000, 0.374, 1457], [Infinity, 0.447, 0]],
    7: [[5000, 0.697, 0], [20000, 0.394, 1515], [Infinity, 0.470, 0]],
  },
});


// HELPERS

// Convertit en nombre, retourne defaut si invalide
function nombre(value, defaut = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaut;
}

// Arrondit à 2 décimales
function arrondir(n) {
  return Math.round(nombre(n) * 100) / 100;
}

// Contraint une valeur entre min et max
function clamp(n, min, max) {
  return Math.min(Math.max(nombre(n), min), max);
}

// Somme de N valeurs en sécurité
function somme(...values) {
  return values.reduce((acc, v) => acc + nombre(v, 0), 0);
}


// NORMALISEURS

function normaliserEnfant(enfant = {}) {
  return { garde: enfant.garde === "alternee" ? "alternee" : "exclusive" };
}

function normaliserProfil(profil = {}) {
  const situation = ["marie", "pacse", "celibataire", "divorce", "veuf", "concubin"].includes(profil.situation)
    ? profil.situation
    : "celibataire";
  return {
    situation,
    enfants: Array.isArray(profil.enfants) ? profil.enfants.map(normaliserEnfant) : [],
    invalidite: Boolean(profil.invalidite),
    ancienCombattant: Boolean(profil.ancienCombattant),
  };
}

function normaliserDeclarant(data = {}) {
  return {
    salaireNet: Math.max(nombre(data.salaireNet), 0),
    salaireBrut: Math.max(nombre(data.salaireBrut), 0),
    pasVerse: Math.max(nombre(data.pasVerse), 0),
    pfuVerseCase2CK: Math.max(nombre(data.pfuVerseCase2CK), 0),
    autresRevenus: {
      pensionsRetraites: Math.max(nombre(data.autresRevenus?.pensionsRetraites), 0),
      rcmBrut: Math.max(nombre(data.autresRevenus?.rcmBrut), 0),
    },
    km: data.km || null,
    repas: data.repas || null,
    autres: data.autres || null,
  };
}

function normaliserOptions(options = {}) {
  const modeDeclaration = ["commune", "separee", "comparatif"].includes(options.modeDeclaration)
    ? options.modeDeclaration
    : "commune";
  const premiereAnneeUnion = Boolean(options.premiereAnneeUnion);
  const repartitionCommuns = {
    revenus: clamp(options.repartitionCommuns?.revenus ?? 0.5, 0, 1),
    charges: clamp(options.repartitionCommuns?.charges ?? 0.5, 0, 1),
  };
  return { modeDeclaration, premiereAnneeUnion, repartitionCommuns };
}


// PARTS FISCALES

function calculerParts(profil = {}) {
  const p = normaliserProfil(profil);
  const isCouple = ["marie", "pacse"].includes(p.situation);
  let parts = isCouple ? 2 : 1;
  let partsEnfants = 0;
  let premierEnfantExclusif = false;

  p.enfants.forEach((enfant, index) => {
    const rang = index + 1;
    const alt = enfant.garde === "alternee";
    if (rang <= 2) partsEnfants += alt ? 0.25 : 0.5;
    else partsEnfants += alt ? 0.50 : 1.0;
    if (!alt && !premierEnfantExclusif) premierEnfantExclusif = true;
  });

  parts += partsEnfants;
  const estSeul = ["celibataire", "divorce", "veuf", "concubin"].includes(p.situation);
  if (estSeul && premierEnfantExclusif) parts += 0.5;
  if (p.invalidite) parts += 0.5;
  if (p.ancienCombattant) parts += 0.5;

  return arrondir(parts);
}


// FRAIS PROFESSIONNELS

// Abattement 10 % sur salaire net (min 495 €, max 14 426 €)
function calculerAbattement(salaireNet = 0) {
  const a = nombre(salaireNet) * CONSTANTES.ABATTEMENTSALAIRE.taux;
  return arrondir(clamp(a, CONSTANTES.ABATTEMENTSALAIRE.min, CONSTANTES.ABATTEMENTSALAIRE.max));
}

function _appliquerBaremeKm(km, tranches) {
  for (const [limite, coef, fixe] of tranches) {
    if (km <= limite) return km * coef + fixe;
  }
  return 0;
}

// Calcule les frais kilométriques.
function calculerFraisKm(params = {}) {
  const cv = nombre(params.cv);
  const kmAllerSimple = Math.max(nombre(params.kmAllerSimple), 0);
  const jours = Math.max(nombre(params.jours), 0);
  const peages = Math.max(nombre(params.peages), 0);
  const parking = Math.max(nombre(params.parking), 0);
  const kmProsSupplementaires = Math.max(nombre(params.kmProsSupplementaires), 0);
  const typeVehicule = params.typeVehicule || "thermique";

  const kmRetenu = Math.min(kmAllerSimple, CONSTANTES.KMMAXSANSJUSTIFICATIF);
  const estPlafonne = kmAllerSimple > CONSTANTES.KMMAXSANSJUSTIFICATIF;
  const kmDomicile = kmRetenu * 2 * jours;
  const kmTotal = kmDomicile + kmProsSupplementaires;

  let fraisKmBrut = 0;
  if (typeVehicule === "moto") {
    const cvMoto = cv <= 2 ? 2 : cv <= 5 ? 5 : 99;
    fraisKmBrut = _appliquerBaremeKm(kmTotal, CONSTANTES.BAREMEKMMOTO[cvMoto]);
  } else if (typeVehicule === "velo") {
    fraisKmBrut = _appliquerBaremeKm(kmTotal, CONSTANTES.BAREMEKMVELO);
  } else {
    const cvVoiture = clamp(cv, 3, 7);
    fraisKmBrut = _appliquerBaremeKm(kmTotal, CONSTANTES.BAREMEKMVOITURE[cvVoiture]);
  }

  const majoration = typeVehicule === "electrique" ? fraisKmBrut * 0.2 : 0;

  return {
    fraisKmBrut: arrondir(fraisKmBrut),
    majoration: arrondir(majoration),
    peages: arrondir(peages),
    parking: arrondir(parking),
    kmDomicileTravail: arrondir(kmDomicile),
    kmProsSupplementaires: arrondir(kmProsSupplementaires),
    kmTotal: arrondir(kmTotal),
    estPlafonne,
    kmAllerSimpleRetenu: arrondir(kmRetenu),
    fraisKmTotal: arrondir(fraisKmBrut + majoration + peages + parking),
  };
}

// Calcule les frais de repas.
function calculerFraisRepas(params = {}) {
  const avecJustificatifs = Boolean(params.avecJustificatifs);
  const coutRepasJour = Math.max(nombre(params.coutRepasJour), 0);
  const partPatronaleJour = Math.max(nombre(params.partPatronaleJour), 0);
  const jours = Math.max(nombre(params.jours), 0);

  // Prix du repas retenu
  const coutRetenuJour = avecJustificatifs
    ? Math.min(coutRepasJour, CONSTANTES.FRAISREPAS.plafond)      // plafonné à 21,10 €
    : CONSTANTES.FRAISREPAS.forfaitSansJustificatifs;              // forfait admis = 10,90 €

  // Surplus déductible = ce qu'on a payé EN PLUS du repas à domicile
  const surcoutJour = Math.max(coutRetenuJour - CONSTANTES.FRAISREPAS.domicile, 0);
  // → Sans justif : 10,90 - 5,45 = 5,45 € net/jour
  // → Avec justif : prix_réel - 5,45 € (ex: 9€ - 5,45 = 3,55 €/jour)

  // Déduire la part patronale du ticket-restaurant si applicable
  const avantageTRJour = Math.min(partPatronaleJour, surcoutJour);
  const netParJour = Math.max(surcoutJour - avantageTRJour, 0);
  const fraisRepasNet = arrondir(netParJour * jours);

  return {
    fraisRepasNet,
    detail: {
      coutRetenuJour: arrondir(coutRetenuJour),
      surcoutJour: arrondir(surcoutJour),
      avantageTRJour: arrondir(avantageTRJour),
      netParJour: arrondir(netParJour),
      avecJustificatifs,
    },
  };
}

// Calcule les autres frais professionnels.
function calculerAutresFrais(frais = {}) {
  const materiel = Math.max(nombre(frais.materiel), 0);
  const formation = Math.max(nombre(frais.formation), 0);
  const vetements = Math.max(nombre(frais.vetements), 0);
  const documentation = Math.max(nombre(frais.documentation), 0);
  const doubleResidence = Math.max(nombre(frais.doubleResidence), 0);
  const joursTeletravail = Math.max(nombre(frais.joursTeletravail), 0);
  const cotisationsSyndicales = Math.max(nombre(frais.cotisationsSyndicales), 0);

  const fraisTeletravail = Math.min(
    joursTeletravail * CONSTANTES.TELETRAVAIL.tauxJour,
    CONSTANTES.TELETRAVAIL.plafond
  );

  return {
    totalAutresFrais: arrondir(somme(materiel, formation, vetements, documentation, doubleResidence, fraisTeletravail, cotisationsSyndicales)),
    detailFrais: {
      materiel: arrondir(materiel),
      formation: arrondir(formation),
      vetements: arrondir(vetements),
      documentation: arrondir(documentation),
      doubleResidence: arrondir(doubleResidence),
      fraisTeletravail: arrondir(fraisTeletravail),
      cotisationsSyndicales: arrondir(cotisationsSyndicales),
    },
  };
}

// Compare abattement 10 % et frais réels, retourne le plus avantageux
function calculerFraisReelsTotal(salaireNet = 0, fraisKmTotal = 0, fraisRepasNet = 0, totalAutresFrais = 0) {
  const abattement = calculerAbattement(salaireNet);
  const totalFraisReels = arrondir(somme(fraisKmTotal, fraisRepasNet, totalAutresFrais));
  const plusAvantageux = totalFraisReels > abattement;
  return {
    abattement,
    totalFraisReels,
    fraisRetenus: plusAvantageux ? totalFraisReels : abattement,
    fraisReelsPlusAvantageux: plusAvantageux,
    economie: plusAvantageux ? arrondir(totalFraisReels - abattement) : 0,
  };
}

// Agrège les trois blocs de frais d'un déclarant et les compare à l'abattement
function _calculerFraisParDeclarant(declarant = {}) {
  const km = declarant.km ? calculerFraisKm(declarant.km) : { fraisKmTotal: 0 };
  const repas = declarant.repas ? calculerFraisRepas(declarant.repas) : { fraisRepasNet: 0 };
  const autres = declarant.autres ? calculerAutresFrais(declarant.autres) : { totalAutresFrais: 0 };
  const fraisReels = calculerFraisReelsTotal(declarant.salaireNet, km.fraisKmTotal, repas.fraisRepasNet, autres.totalAutresFrais);
  return { km, repas, autres, fraisReels };
}


// REVENU NET IMPOSABLE

// Calcule le revenu net imposable du foyer.
function calculerRevenuNetImposable(declarants = []) {
  let revenuNetImposable = 0;
  const detailDeclarants = [];

  declarants.forEach((d) => {
    const salaireNet = Math.max(nombre(d.salaireNet), 0);
    const fraisRetenus = Math.max(nombre(d.fraisRetenus), 0);
    const pensionsRetraites = Math.max(nombre(d.autresRevenus?.pensionsRetraites), 0);
    const rcmBrut = Math.max(nombre(d.autresRevenus?.rcmBrut), 0);

    const abattementPensions = pensionsRetraites > 0
      ? Math.min(Math.max(pensionsRetraites * CONSTANTES.ABATTEMENTPENSIONS.taux, CONSTANTES.ABATTEMENTPENSIONS.min), CONSTANTES.ABATTEMENTPENSIONS.max)
      : 0;
    const pensionsNettes = Math.max(pensionsRetraites - abattementPensions, 0);
    const revenuDeclarant = arrondir(Math.max(salaireNet - fraisRetenus, 0) + pensionsNettes + rcmBrut);

    revenuNetImposable += revenuDeclarant;
    detailDeclarants.push({ salaireNet: arrondir(salaireNet), fraisRetenus: arrondir(fraisRetenus), pensionsRetraites: arrondir(pensionsRetraites), abattementPensions: arrondir(abattementPensions), pensionsNettes: arrondir(pensionsNettes), rcmNet: arrondir(rcmBrut), revenuDeclarant });
  });

  return { revenuNetImposable: arrondir(revenuNetImposable), detailDeclarants };
}


// IMPÔT BRUT + PLAFONNEMENT + DÉCOTE

function calculerImpotBrutSimple(revenuNetImposable = 0, nbParts = 1) {
  const qf = nombre(revenuNetImposable) / Math.max(nombre(nbParts), 1);
  let impotParPart = 0;
  let precedente = 0;
  for (const tranche of CONSTANTES.BAREMEIR2026) {
    if (qf <= precedente) break;
    impotParPart += (Math.min(qf, tranche.limite) - precedente) * tranche.taux;
    precedente = tranche.limite;
  }
  return arrondir(impotParPart * nbParts);
}

function _impotSansEnfants(revenuNetImposable = 0, nbParts = 1) {
  const nbPartBase = nbParts >= 2 ? 2 : 1;
  return { nbPartBase, impotBrut: calculerImpotBrutSimple(revenuNetImposable, nbPartBase) };
}

function _plafonnementQF(impotAvec, impotSans, nbPartsTotales, nbPartsBase) {
  const demiParts = Math.max((nombre(nbPartsTotales) - nombre(nbPartsBase)) * 2, 0);
  const reductionMax = demiParts * CONSTANTES.PLAFONDDEMIPART;
  const reductionReelle = nombre(impotSans) - nombre(impotAvec);
  if (reductionReelle > reductionMax) return { impotBrutPlafonne: arrondir(nombre(impotSans) - reductionMax), reductionPlafonnee: true, reductionMax: arrondir(reductionMax) };
  return { impotBrutPlafonne: arrondir(impotAvec), reductionPlafonnee: false, reductionMax: arrondir(reductionMax) };
}

// Calcule l'impôt brut avec détail des tranches et plafonnement QF.
function calculerImpotBrut(revenuNetImposable = 0, nbParts = 1) {
  const qf = nombre(revenuNetImposable) / Math.max(nombre(nbParts), 1);
  const detailTranches = [];
  let impotParPart = 0;
  let precedente = 0;

  for (const tranche of CONSTANTES.BAREMEIR2026) {
    if (qf <= precedente) break;
    const base = Math.min(qf, tranche.limite) - precedente;
    const imp = base * tranche.taux;
    impotParPart += imp;
    detailTranches.push({ taux: tranche.taux, baseImposable: arrondir(base), impot: arrondir(imp), plafond: tranche.limite });
    precedente = tranche.limite;
  }

  const impotBrutAvant = arrondir(impotParPart * nbParts);
  const sans = _impotSansEnfants(revenuNetImposable, nbParts);
  const plaf = _plafonnementQF(impotBrutAvant, sans.impotBrut, nbParts, sans.nbPartBase);

  return {
    impotBrut: plaf.impotBrutPlafonne,
    impotBrutAvantPlafonnement: impotBrutAvant,
    reductionPlafonnee: plaf.reductionPlafonnee,
    reductionMaxQF: plaf.reductionMax,
    quotientFamilial: arrondir(qf),
    impotParPart: arrondir(impotParPart),
    detailTranches,
  };
}

// Calcule la décote.
function calculerDecote(impotBrut = 0, statut = "seul") {
  const conf = statut === "couple" ? CONSTANTES.DECOTE.couple : CONSTANTES.DECOTE.seul;
  let decote = 0;
  if (nombre(impotBrut) < conf.seuil) decote = conf.montant - nombre(impotBrut) * CONSTANTES.DECOTE.taux;
  decote = Math.max(arrondir(decote), 0);
  return { decote, impotApresDecote: Math.max(arrondir(nombre(impotBrut) - decote), 0) };
}


// CRÉDITS ET RÉDUCTIONS

// Crédit d'impôt garde d'enfant(s).
function calculerCreditGardeEnfant(gardes = []) {
  let creditGardeTotal = 0;
  const detailParEnfant = gardes.map((garde, index) => {
    const depensesNettes = Math.max(nombre(garde.depensesNettes), 0);
    const typeGarde = garde.typeGarde === "alternee" ? "alternee" : "exclusive";
    const plafond = typeGarde === "alternee" ? CONSTANTES.GARDEENFANT.plafondAlterne : CONSTANTES.GARDEENFANT.plafondExclusif;
    const depensesRetenues = Math.min(depensesNettes, plafond);
    const credit = arrondir(depensesRetenues * CONSTANTES.GARDEENFANT.taux);
    creditGardeTotal += credit;
    return { enfant: index + 1, typeGarde, depensesNettes: arrondir(depensesNettes), depensesRetenues: arrondir(depensesRetenues), plafond: arrondir(plafond), credit };
  });
  return { creditGardeTotal: arrondir(creditGardeTotal), detailParEnfant };
}

// Crédit d'impôt services à domicile.
function calculerCreditServicesDomicile(params = {}) {
  const menageRepassage = Math.max(nombre(params.menageRepassage), 0);
  const jardinage = Math.max(nombre(params.jardinage), 0);
  const soutienScolaire = Math.max(nombre(params.soutienScolaire), 0);
  const assistanceInfo = Math.max(nombre(params.assistanceInfo), 0);
  const aidePersonneAgee = Math.max(nombre(params.aidePersonneAgee), 0);
  const petitBricolage = Math.max(nombre(params.petitBricolage), 0);
  const nbEnfants = Math.max(nombre(params.nbEnfants), 0);
  const plus65ans = Boolean(params.plus65ans);
  const personneDependante = Boolean(params.personneDependante);

  const assistanceInfoRetenue = Math.min(assistanceInfo, CONSTANTES.SERVICESDOMICILE.plafondAssistanceInfo);
  const petitBricolageRetenu = Math.min(petitBricolage, CONSTANTES.SERVICESDOMICILE.plafondPetitBricolage);

  let plafond = personneDependante
    ? CONSTANTES.SERVICESDOMICILE.plafondDependance
    : CONSTANTES.SERVICESDOMICILE.plafondBase + nbEnfants * CONSTANTES.SERVICESDOMICILE.majorationEnfant;
  if (plus65ans) plafond += CONSTANTES.SERVICESDOMICILE.majoration65Ans;
  plafond = Math.min(plafond, CONSTANTES.SERVICESDOMICILE.plafondMajoreMax);

  const depensesTotales = somme(menageRepassage, jardinage, soutienScolaire, assistanceInfoRetenue, aidePersonneAgee, petitBricolageRetenu);
  const depensesRetenues = Math.min(depensesTotales, plafond);

  return {
    creditServicesDomicile: arrondir(depensesRetenues * CONSTANTES.SERVICESDOMICILE.taux),
    plafondApplique: arrondir(plafond),
    depensesRetenues: arrondir(depensesRetenues),
    detailServices: { menageRepassage: arrondir(menageRepassage), jardinage: arrondir(jardinage), soutienScolaire: arrondir(soutienScolaire), assistanceInfoRetenue: arrondir(assistanceInfoRetenue), aidePersonneAgee: arrondir(aidePersonneAgee), petitBricolageRetenu: arrondir(petitBricolageRetenu) },
  };
}

// Réduction dons.
function calculerReductionDons(dons = {}, revenuImposable = 0) {
  const aidePersonnes = Math.max(nombre(dons.aidePersonnes), 0);
  const interetGeneral = Math.max(nombre(dons.interetGeneral), 0);
  const partisPolitiques = Math.max(nombre(dons.partisPolitiques), 0);
  const recherche = Math.max(nombre(dons.recherche), 0);
  const plafond20pct = nombre(revenuImposable) * CONSTANTES.DONS.plafondPctRevenu;

  const reductionAide = aidePersonnes <= CONSTANTES.DONS.seuilAidePersonnes
    ? aidePersonnes * CONSTANTES.DONS.tauxAidePersonnes1
    : CONSTANTES.DONS.seuilAidePersonnes * CONSTANTES.DONS.tauxAidePersonnes1 + (aidePersonnes - CONSTANTES.DONS.seuilAidePersonnes) * CONSTANTES.DONS.tauxAidePersonnes2;

  const reductionInteretGeneral = Math.min(interetGeneral, plafond20pct) * CONSTANTES.DONS.tauxInteretGeneral;
  const reductionPartis = Math.min(partisPolitiques, CONSTANTES.DONS.plafondPartis) * CONSTANTES.DONS.tauxPartis;
  const reductionRecherche = Math.min(recherche, plafond20pct) * CONSTANTES.DONS.tauxRecherche;

  return {
    reductionDonsTotal: arrondir(somme(reductionAide, reductionInteretGeneral, reductionPartis, reductionRecherche)),
    detailDons: {
      aidePersonnes: { don: arrondir(aidePersonnes), reduction: arrondir(reductionAide) },
      interetGeneral: { don: arrondir(interetGeneral), reduction: arrondir(reductionInteretGeneral) },
      partisPolitiques: { don: arrondir(partisPolitiques), reduction: arrondir(reductionPartis) },
      recherche: { don: arrondir(recherche), reduction: arrondir(reductionRecherche) },
    },
  };
}

// Réduction scolarité.
function calculerReductionScolarite(scolarite = {}) {
  const nbCollege = Math.max(nombre(scolarite.nbCollege), 0);
  const nbLycee = Math.max(nombre(scolarite.nbLycee), 0);
  const nbSuperieur = Math.max(nombre(scolarite.nbSuperieur), 0);
  const rc = nbCollege * CONSTANTES.SCOLARITE.college;
  const rl = nbLycee * CONSTANTES.SCOLARITE.lycee;
  const rs = nbSuperieur * CONSTANTES.SCOLARITE.superieur;
  return {
    reductionScolariteTotal: arrondir(somme(rc, rl, rs)),
    detailScolarite: {
      college: { nb: nbCollege, reduction: arrondir(rc) },
      lycee: { nb: nbLycee, reduction: arrondir(rl) },
      superieur: { nb: nbSuperieur, reduction: arrondir(rs) },
    },
  };
}

// Crédit syndical (si pas déjà inclus dans frais réels).
function calculerCreditSyndicat(montantCotisations = 0, salaireBrut = 0) {
  const plafond = Math.max(nombre(salaireBrut), 0) * CONSTANTES.SYNDICAT.plafondPctSalaireBrut;
  const cotisationsRetenues = Math.min(Math.max(nombre(montantCotisations), 0), plafond);
  return { cotisationsRetenues: arrondir(cotisationsRetenues), creditSyndicat: arrondir(cotisationsRetenues * CONSTANTES.SYNDICAT.taux) };
}

// Réduction EHPAD.
function calculerReductionEhpad(params = {}) {
  const depenses = Math.max(nombre(params.depenses), 0);
  const nbPersonnes = Math.max(nombre(params.nbPersonnes), 1);
  const plafond = CONSTANTES.EHPAD.plafondParPersonne * nbPersonnes;
  const baseRetenue = Math.min(depenses, plafond);
  return { baseRetenue: arrondir(baseRetenue), plafondApplique: arrondir(plafond), reductionEhpad: arrondir(baseRetenue * CONSTANTES.EHPAD.taux) };
}

// CONSTRUCTION DES CASES FISCALES
// Construit le dictionnaire des cases à reporter sur la déclaration.
function construireCases(fraisDataNorm = {}, creditsData = {}) {
  const cases = {};
  const d1 = fraisDataNorm.d1 || {};
  const d2 = fraisDataNorm.d2 || {};

  // Salaires
  if (d1.salaireNet)  cases["1AJ"] = arrondir(d1.salaireNet);
  if (d2?.salaireNet) cases["1BJ"] = arrondir(d2.salaireNet);

  // Frais réels
  if (d1.fraisReels?.fraisReelsPlusAvantageux) cases["1AK"] = arrondir(d1.fraisReels.totalFraisReels);
  if (d2?.fraisReels?.fraisReelsPlusAvantageux) cases["1BK"] = arrondir(d2.fraisReels.totalFraisReels);

  // Pensions / retraites
  if (d1.autresRevenus?.pensionsRetraites)  cases["1AS"] = arrondir(d1.autresRevenus.pensionsRetraites);
  if (d2?.autresRevenus?.pensionsRetraites) cases["1BS"] = arrondir(d2.autresRevenus.pensionsRetraites);

  // Revenus de capitaux mobiliers — somme D1+D2 (case commune)
  const rcmTotal = arrondir(somme(d1.autresRevenus?.rcmBrut, d2?.autresRevenus?.rcmBrut));
  if (rcmTotal > 0) cases["2DC"] = rcmTotal;

  // PFU déjà versé — somme D1+D2 (case commune)
  const pfuTotal = arrondir(somme(d1.pfuVerseCase2CK, d2?.pfuVerseCase2CK));
  if (pfuTotal > 0) cases["2CK"] = pfuTotal;

  // Prélèvement à la source
  if (d1.pasVerse)  cases["8HV"] = arrondir(d1.pasVerse);
  if (d2?.pasVerse) cases["8IW"] = arrondir(d2.pasVerse);

  // Garde enfants
  const gardeTotal = Array.isArray(creditsData.gardes)
    ? somme(...creditsData.gardes.map(g => Math.max(nombre(g.depensesNettes), 0)))
    : 0;
  if (gardeTotal > 0) cases["7GA"] = arrondir(gardeTotal);

  // Services domicile
  if (creditsData.servicesDomicile) {
    const s = creditsData.servicesDomicile;
    const domicile = somme(s.menageRepassage, s.jardinage, s.soutienScolaire, s.assistanceInfo, s.petitBricolage);
    if (domicile > 0) cases["7DB"] = arrondir(domicile);
    if (s.aidePersonneAgee) cases["7DG"] = arrondir(s.aidePersonneAgee);
  }

  // Dons
  if (creditsData.dons?.aidePersonnes)    cases["7UD"] = arrondir(creditsData.dons.aidePersonnes);
  if (creditsData.dons?.interetGeneral)   cases["7UF"] = arrondir(creditsData.dons.interetGeneral);
  if (creditsData.dons?.partisPolitiques) cases["7UH"] = arrondir(creditsData.dons.partisPolitiques);
  if (creditsData.dons?.recherche)        cases["7UV"] = arrondir(creditsData.dons.recherche);

  // Scolarité
  if (creditsData.scolarite?.nbCollege)    cases["7EA"] = Math.round(nombre(creditsData.scolarite.nbCollege));
  if (creditsData.scolarite?.nbLycee)      cases["7EC"] = Math.round(nombre(creditsData.scolarite.nbLycee));
  if (creditsData.scolarite?.nbSuperieur)  cases["7EF"] = Math.round(nombre(creditsData.scolarite.nbSuperieur));

  // Syndicat / EHPAD
  if (creditsData.syndicat?.montant) cases["7AC"] = arrondir(creditsData.syndicat.montant);
  if (creditsData.ehpad?.depenses)   cases["7CD"] = arrondir(creditsData.ehpad.depenses);

  // Cryptomonnaies
  if (creditsData.crypto?.plusValue  > 0) cases["3AN"] = arrondir(creditsData.crypto.plusValue);
  if (creditsData.crypto?.moinsValue > 0) cases["3BN"] = arrondir(creditsData.crypto.moinsValue);
  if (creditsData.crypto?.bareme === "progressif") cases["3CN"] = true;

  return cases;
}

// -----------------------------------------------------------------------------
// 10. CALCUL DES CRÉDITS/RÉDUCTIONS (bloc commun)
// -----------------------------------------------------------------------------

function _calculerCreditsReductions(profil, creditsData = {}, d1 = {}) {
  const gardeData = Array.isArray(creditsData.gardes)
    ? calculerCreditGardeEnfant(creditsData.gardes)
    : { creditGardeTotal: 0, detailParEnfant: [] };

  const domicileData = creditsData.servicesDomicile
    ? calculerCreditServicesDomicile({ ...creditsData.servicesDomicile, nbEnfants: profil.enfants?.length || 0 })
    : { creditServicesDomicile: 0, plafondApplique: 0, depensesRetenues: 0, detailServices: {} };

  const donsData = creditsData.dons
    ? calculerReductionDons(creditsData.dons, 0)
    : { reductionDonsTotal: 0, detailDons: {} };

  const scolariteData = creditsData.scolarite
    ? calculerReductionScolarite(creditsData.scolarite)
    : { reductionScolariteTotal: 0, detailScolarite: {} };

  const syndicatData = (creditsData.syndicat && !d1.autres?.cotisationsSyndicales)
    ? calculerCreditSyndicat(creditsData.syndicat.montant, d1.salaireBrut)
    : { creditSyndicat: 0, cotisationsRetenues: 0 };

  const ehpadData = creditsData.ehpad
    ? calculerReductionEhpad(creditsData.ehpad)
    : { reductionEhpad: 0, baseRetenue: 0, plafondApplique: 0 };

  return { gardeData, domicileData, donsData, scolariteData, syndicatData, ehpadData };
}


// CALCUL DE BASE — scénario commun (un seul foyer fiscal)
// Calcule le résultat complet pour un foyer fiscal unique.
function calculerResultatBase(profil = {}, fraisData = {}, creditsData = {}, options = {}) {
  const p = normaliserProfil(profil);
  const opts = normaliserOptions(options);
  const d1 = normaliserDeclarant(fraisData.d1 || {});
  const d2 = fraisData.d2 ? normaliserDeclarant(fraisData.d2) : null;

  const isCouple = ["marie", "pacse"].includes(p.situation);
  const statut = isCouple ? "couple" : "seul";
  const nbParts = calculerParts(p);

  const detFraisD1 = _calculerFraisParDeclarant(d1);
  const detFraisD2 = d2 ? _calculerFraisParDeclarant(d2) : null;

  const declarants = [{ salaireNet: d1.salaireNet, fraisRetenus: detFraisD1.fraisReels.fraisRetenus, autresRevenus: d1.autresRevenus }];
  if (d2) declarants.push({ salaireNet: d2.salaireNet, fraisRetenus: detFraisD2.fraisReels.fraisRetenus, autresRevenus: d2.autresRevenus });

  const { revenuNetImposable, detailDeclarants } = calculerRevenuNetImposable(declarants);
  const impotBrutData = calculerImpotBrut(revenuNetImposable, nbParts);
  const decoteData = calculerDecote(impotBrutData.impotBrut, statut);

  const { gardeData, domicileData, donsData, scolariteData, syndicatData, ehpadData } =
    _calculerCreditsReductions(p, creditsData, d1);

  const pfuDejaVerse = arrondir(somme(d1.pfuVerseCase2CK, d2?.pfuVerseCase2CK));
  const totalCreditsReductions = arrondir(somme(
    gardeData.creditGardeTotal,
    domicileData.creditServicesDomicile,
    donsData.reductionDonsTotal,
    scolariteData.reductionScolariteTotal,
    syndicatData.creditSyndicat,
    ehpadData.reductionEhpad,
    pfuDejaVerse,
  ));

  const impotNet = Math.max(arrondir(decoteData.impotApresDecote - totalCreditsReductions), 0);
  const pasTotal = arrondir(somme(d1.pasVerse, d2?.pasVerse));
  const solde = arrondir(impotNet - pasTotal);

  const cases = construireCases(
    { d1: { ...d1, fraisReels: detFraisD1.fraisReels }, d2: d2 ? { ...d2, fraisReels: detFraisD2.fraisReels } : null },
    creditsData,
  );

  return {
    meta: { version: "2026.04", anneeImposition: 2026, anneeRevenus: 2025, modeDeclaration: opts.modeDeclaration },
    profil: p,
    nbParts, statut,
    fraisD1: detFraisD1.fraisReels,
    detailsFraisD1: { km: detFraisD1.km, repas: detFraisD1.repas, autres: detFraisD1.autres },
    fraisD2: detFraisD2?.fraisReels || null,
    detailsFraisD2: detFraisD2 ? { km: detFraisD2.km, repas: detFraisD2.repas, autres: detFraisD2.autres } : null,
    economieFraisReelsTotal: arrondir(somme(detFraisD1.fraisReels.economie, detFraisD2?.fraisReels?.economie)),
    revenuNetImposable, detailDeclarants,
    quotientFamilial: impotBrutData.quotientFamilial,
    detailTranches: impotBrutData.detailTranches,
    impotBrutAvantPlafonnement: impotBrutData.impotBrutAvantPlafonnement,
    reductionPlafonnee: impotBrutData.reductionPlafonnee,
    reductionMaxQF: impotBrutData.reductionMaxQF,
    impotBrut: impotBrutData.impotBrut,
    decote: decoteData.decote,
    impotApresDecote: decoteData.impotApresDecote,
    creditGardeTotal: gardeData.creditGardeTotal,
    creditServicesDomicile: domicileData.creditServicesDomicile,
    reductionDonsTotal: donsData.reductionDonsTotal,
    reductionScolariteTotal: scolariteData.reductionScolariteTotal,
    creditSyndicat: syndicatData.creditSyndicat,
    reductionEhpad: ehpadData.reductionEhpad,
    pfuDejaVerse, totalCreditsReductions,
    impotNet, pasTotal, solde, cases,
    detailsCredits: { garde: gardeData, servicesDomicile: domicileData, dons: donsData, scolarite: scolariteData, syndicat: syndicatData, ehpad: ehpadData },
  };
}

// SCÉNARIO SÉPARÉ - première année de mariage/PACS
// Répartit les revenus communs entre les deux déclarants (défaut 50/50).
function repartirCommuns(revenusCommuns = 0, chargesCommunes = 0, repartition = {}) {
  const r1 = clamp(repartition.revenus ?? 0.5, 0, 1);
  const r2 = 1 - r1;
  const c1 = clamp(repartition.charges ?? 0.5, 0, 1);
  const c2 = 1 - c1;
  return {
    revenus1: arrondir(revenusCommuns * r1), revenus2: arrondir(revenusCommuns * r2),
    charges1: arrondir(chargesCommunes * c1), charges2: arrondir(chargesCommunes * c2),
    tauxRepartition: { revenus: r1, charges: c1 },
  };
}

// Répartit les enfants entre les deux déclarations séparées.
function repartitionParDefautEnfants(enfants = [], overrides = null) {
  if (Array.isArray(overrides) && overrides.length === enfants.length) return overrides;
  return enfants.map((e, i) => ({
    index: i,
    garde: e.garde,
    attribueA: e.garde === "alternee" ? "les deux" : (i % 2 === 0 ? "decl1" : "decl2"),
  }));
}

// Construit et calcule le scénario de déclarations séparées.
function construireScenarioSepare(profil = {}, fraisData = {}, creditsData = {}, options = {}) {
  const p = normaliserProfil(profil);
  const d1 = normaliserDeclarant(fraisData.d1 || {});
  const d2 = normaliserDeclarant(fraisData.d2 || {});
  const opts = normaliserOptions(options);

  const repartEnfants = repartitionParDefautEnfants(p.enfants, options.repartitionEnfants);

  // Enfants pour chaque déclaration
  const enfants1 = p.enfants.filter((_, i) =>
    repartEnfants[i]?.attribueA === "decl1" || repartEnfants[i]?.attribueA === "les deux"
  );
  const enfants2 = p.enfants.filter((_, i) =>
    repartEnfants[i]?.attribueA === "decl2" || repartEnfants[i]?.attribueA === "les deux"
  );

  const profil1 = { ...p, situation: "celibataire", enfants: enfants1 };
  const profil2 = { ...p, situation: "celibataire", enfants: enfants2 };

  // Crédits : garde et services domicile partagés selon répartition des enfants
  // Dons et EHPAD : appliqués en totalité sur la déclaration 1 par défaut (à affiner)
  const result1 = calculerResultatBase(profil1, { d1 }, creditsData, { modeDeclaration: "separee" });
  const result2 = calculerResultatBase(profil2, { d1: d2 }, creditsData, { modeDeclaration: "separee" });

  const total = {
    impotNet: arrondir(somme(result1.impotNet, result2.impotNet)),
    pasTotal: arrondir(somme(result1.pasTotal, result2.pasTotal)),
    solde: arrondir(somme(result1.solde, result2.solde)),
  };

  return {
    mode: "separee",
    repartitionCommuns: repartirCommuns(0, 0, opts.repartitionCommuns),
    repartitionEnfants: repartEnfants,
    result1,
    result2,
    total,
  };
}


// SCÉNARIO COMPARATIF — choisit la meilleure option
//Lance les deux scénarios (commune et séparé) et identifie le plus avantageux.
function calculerScenarioCompare(profil = {}, fraisData = {}, creditsData = {}, options = {}) {
  const commune = calculerResultatBase(profil, fraisData, creditsData, { ...options, modeDeclaration: "commune" });
  const separee = construireScenarioSepare(profil, fraisData, creditsData, options);
  const best = commune.impotNet <= separee.total.impotNet ? "commune" : "separee";
  return {
    mode: "comparatif",
    commune,
    separee,
    best,
    ecartImpotNet: arrondir(Math.abs(commune.impotNet - separee.total.impotNet)),
    conseil: best === "commune"
      ? "La déclaration commune est plus avantageuse."
      : "Les déclarations séparées sont plus avantageuses.",
  };
}


// POINT D'ENTRÉE PRINCIPAL
// Calcule le résultat fiscal complet selon le mode et la situation.
function calculerResultat(profil = {}, fraisData = {}, creditsData = {}, options = {}) {
  const p = normaliserProfil(profil);
  const opts = normaliserOptions(options);
  const estUnion = ["marie", "pacse"].includes(p.situation);

  // Comparatif uniquement autorisé la première année d'union
  if (estUnion && opts.premiereAnneeUnion && opts.modeDeclaration === "comparatif") {
    return calculerScenarioCompare(profil, fraisData, creditsData, opts);
  }

  // Déclaration séparée : première année d'union seulement
  if (estUnion && opts.modeDeclaration === "separee") {
    return construireScenarioSepare(profil, fraisData, creditsData, opts);
  }

  // Défaut : foyer commun
  return calculerResultatBase(profil, fraisData, creditsData, opts);
}


// EXPORT

const api = {
  // Constantes
  CONSTANTES,
  // Helpers
  nombre, arrondir, clamp, somme,
  // Normaliseurs
  normaliserEnfant, normaliserProfil, normaliserDeclarant, normaliserOptions,
  // Parts
  calculerParts,
  // Frais
  calculerAbattement, calculerFraisKm, calculerFraisRepas, calculerAutresFrais, calculerFraisReelsTotal,
  // Revenu
  calculerRevenuNetImposable,
  // Impôt
  calculerImpotBrutSimple, calculerImpotBrut, calculerDecote,
  // Crédits
  calculerCreditGardeEnfant, calculerCreditServicesDomicile, calculerReductionDons,
  calculerReductionScolarite, calculerCreditSyndicat, calculerReductionEhpad,
  // Cases
  construireCases,
  // Scénarios
  calculerResultatBase,
  construireScenarioSepare,
  calculerScenarioCompare,
  repartirCommuns,
  repartitionParDefautEnfants,
  // Point d\'entrée unique
  calculerResultat,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.SimulateurImpot = api;
export { api as default, calculerResultat, calculerResultatBase, construireScenarioSepare, calculerScenarioCompare, repartirCommuns, repartitionParDefautEnfants, CONSTANTES, nombre, arrondir, clamp, somme, normaliserEnfant, normaliserProfil, normaliserDeclarant, normaliserOptions, calculerParts, calculerAbattement, calculerFraisKm, calculerFraisRepas, calculerAutresFrais, calculerFraisReelsTotal, calculerRevenuNetImposable, calculerImpotBrutSimple, calculerImpotBrut, calculerDecote, calculerCreditGardeEnfant, calculerCreditServicesDomicile, calculerReductionDons, calculerReductionScolarite, calculerCreditSyndicat, calculerReductionEhpad, construireCases };