"use strict";
import {
  calculerResultat,
  calculerResultatBase,
  construireScenarioSepare,
  calculerScenarioCompare,
} from "./moteur.js";

// -----------------------------------------------------------------------------
// 1. UTILITAIRES DOM
// -----------------------------------------------------------------------------
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const val = (sel, ctx = document) => {
  const el = $(sel, ctx);
  if (!el) return "";
  return el.type === "checkbox" ? el.checked : el.value.trim();
};
const numVal = (sel, ctx = document) => {
  const v = parseFloat(val(sel, ctx));
  return Number.isFinite(v) ? v : 0;
};
const radioVal = (name, ctx = document) => {
  const el = $(`input[name="${name}"]:checked`, ctx);
  return el ? el.value : "";
};
const show = (sel) => { const el = $(sel); if (el) el.classList.remove("hidden"); };
const hide = (sel) => { const el = $(sel); if (el) el.classList.add("hidden"); };
const toggle = (sel, condition) => condition ? show(sel) : hide(sel);
const eur = (n) => Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// AIDE CONTEXTUELLE
function initAide() {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".btn-aide");
    if (!btn) return;
    const cible = btn.dataset.cible;
    if (!cible) return;
    const box = $("#" + cible);
    if (!box) return;
    const estVisible = !box.classList.contains("hidden");
    box.classList.toggle("hidden", estVisible);
    e.stopPropagation();
  });
}

// -----------------------------------------------------------------------------
// 2. GESTION DES ÉTAPES (navigation)
// -----------------------------------------------------------------------------
let etapeActuelle = 1;
let calculDejaLance = false;
let timerAutoCalc = null;
const ETAPES = [
  "etape-situation",
  "etape-revenus",
  "etape-frais",
  "etape-credits",
  "etape-union",
  "etape-resultats",
];

function afficherEtape(num) {
  ETAPES.forEach((id) => hide(`#${id}`));
  const id = ETAPES[num - 1];
  if (id) show(`#${id}`);
  etapeActuelle = num;
  majProgressBar(num);
}

function majProgressBar(num) {
  const bar = $("#progress-bar");
  if (bar) bar.style.width = `${Math.round((num / ETAPES.length) * 100)}%`;
  const label = $("#progress-label");
  if (label) label.textContent = `Étape ${num} / ${ETAPES.length}`;
}

function etapeSuivante() {
  const situation = radioVal("situation");
  const estCouple = ["marie", "pacse"].includes(situation);
  let prochaine = etapeActuelle + 1;
  if (prochaine === 5 && !estCouple) prochaine = 6;
  afficherEtape(prochaine);
  if (prochaine === 6) {
    maybeAutoCalculate();
  }
}

function etapePrecedente() {
  const situation = radioVal("situation");
  const estCouple = ["marie", "pacse"].includes(situation);
  let precedente = etapeActuelle - 1;
  if (precedente === 5 && !estCouple) precedente = 4;
  if (precedente < 1) precedente = 1;
  afficherEtape(precedente);
}

function formulaireComplet() {
  const situation = radioVal("situation");
  if (!situation) return false;
  const estCouple = ["marie", "pacse"].includes(situation);
  const salaire1 = numVal("#salaireNet_d1");
  if (salaire1 <= 0) return false;
  if (estCouple) {
    const salaire2 = numVal("#salaireNet_d2");
    if (salaire2 <= 0) return false;
  }
  const premiereAnnee = estCouple && radioVal("premiereAnneeUnion") === "oui";
  if (premiereAnnee) {
    const mode = radioVal("modeDeclaration");
    if (!mode) return false;
  }
  return true;
}

function maybeAutoCalculate() {
  if (etapeActuelle !== 6) return;
  if (calculDejaLance) return;
  if (!formulaireComplet()) return;
  if (timerAutoCalc) clearTimeout(timerAutoCalc);
  timerAutoCalc = setTimeout(() => {
    if (!formulaireComplet()) return;
    calculDejaLance = true;
    simuler();
  }, 150);
}

// -----------------------------------------------------------------------------
// 3. VISIBILITÉ DYNAMIQUE DES CHAMPS
// -----------------------------------------------------------------------------
function majVisibiliteChampsConjoint() {
  const situation = radioVal("situation");
  const estCouple = ["marie", "pacse"].includes(situation);
  toggle("#bloc-conjoint", estCouple);
  toggle("#bloc-frais-conjoint", estCouple);
  toggle("#bloc-crypto-conjoint", estCouple);
  hide("#etape-union");
}

function majVisibiliteChampsUnion() {
  const situation = radioVal("situation");
  const estCouple = ["marie", "pacse"].includes(situation);
  const premiereAnnee = val('input[name="premiereAnneeUnion"]:checked') === "oui";
  toggle("#bloc-mode-declaration", estCouple && premiereAnnee);
  toggle("#bloc-repartition-communs", estCouple && premiereAnnee);
}

function majVisibiliteFraisKm(suffix = "d1") {
  const utilise = val(`input[name="utiliseKm_${suffix}"]:checked`) === "oui";
  toggle(`#bloc-km-${suffix}`, utilise);
}

function majVisibiliteFraisRepas(suffix = "d1") {
  const utilise = radioVal(`repas_justificatifs_${suffix}`) === "oui";
  toggle(`#bloc-repas-${suffix}`, val(`input[name="utiliseRepas_${suffix}"]:checked`) === "oui");
  const inputCout = $(`#repas_cout_${suffix}`);
  const hint = $(`#hint-repas-cout-${suffix}`);
  if (!inputCout) return;
  if (utilise) {
    inputCout.readOnly = false;
    inputCout.value = "";
    inputCout.placeholder = "0 €";
    if (hint) hint.textContent = "";
  } else {
    inputCout.readOnly = true;
    inputCout.value = "5.45";
    if (hint) hint.textContent = "Forfait fiscal sans justificatif — non modifiable";
  }
}

// -----------------------------------------------------------------------------
// 4. GESTION DYNAMIQUE DES ENFANTS
// -----------------------------------------------------------------------------
let nbEnfants = 0;

function ajouterEnfant() {
  nbEnfants++;
  const container = $("#liste-enfants");
  if (!container) return;
  const div = document.createElement("div");
  div.className = "enfant-item";
  div.dataset.index = nbEnfants;
  div.innerHTML = `
    <h4>Enfant ${nbEnfants}</h4>
    <div class="field-group">
      <label>Type de garde</label>
      <select name="enfant_garde_${nbEnfants}">
        <option value="exclusive">Garde exclusive</option>
        <option value="alternee">Garde alternée</option>
      </select>
    </div>
    <button type="button" class="btn-remove" onclick="supprimerEnfant(${nbEnfants})">Supprimer</button>
  `;
  container.appendChild(div);
  majCompteurEnfants();
  syncChampsEnfants();
}

function supprimerEnfant(index) {
  const el = $(`.enfant-item[data-index="${index}"]`);
  if (el) el.remove();
  majCompteurEnfants();
  syncChampsEnfants();
}
window.supprimerEnfant = supprimerEnfant;

function majCompteurEnfants() {
  const items = $$(".enfant-item");
  items.forEach((item, i) => {
    item.querySelector("h4").textContent = `Enfant ${i + 1}`;
  });
}

function syncChampsEnfants() {
  const nbE = $$(".enfant-item").length;

  // --- Garde ---
  const sectionGarde = $("#liste-gardes");
  if (sectionGarde) {
    sectionGarde.innerHTML = "";
    if (nbE === 0) {
      sectionGarde.innerHTML = '<p class="hint">Aucun enfant déclaré à l\'étape 1.</p>';
    } else {
      for (let i = 1; i <= nbE; i++) {
        const div = document.createElement("div");
        div.className = "field-group";
        div.innerHTML =
          `<label for="garde_depenses_${i}">Enfant ${i} — Dépenses nettes de garde</label>` +
          `<input type="number" id="garde_depenses_${i}" min="0" step="1" placeholder="0">`;
        sectionGarde.appendChild(div);
      }
    }
  }

  // --- Scolarité ---
  const sectionScol = $("#bloc-scolarite-dynamique");
  if (sectionScol) {
    sectionScol.innerHTML = "";
    if (nbE === 0) {
      sectionScol.innerHTML = '<p class="hint">Aucun enfant déclaré à l\'étape 1.</p>';
    } else {
      const niveaux = [
        { id: "scol_college", label: "Enfants au collège" },
        { id: "scol_lycee", label: "Enfants au lycée" },
        { id: "scol_superieur", label: "Enfants dans le supérieur" },
      ];
      const row = document.createElement("div");
      row.className = "field-row";
      niveaux.forEach(function (n) {
        const div = document.createElement("div");
        div.className = "field-group";
        div.innerHTML =
          `<label for="${n.id}">${n.label} (max ${nbE})</label>` +
          `<input type="number" id="${n.id}" min="0" max="${nbE}" step="1" placeholder="0">`;
        row.appendChild(div);
      });
      sectionScol.appendChild(row);
    }
  }

  const detailsGarde = $("#details-garde");
  const detailsScol = $("#details-scolarite");
  if (detailsGarde) detailsGarde.style.display = nbE > 0 ? "" : "none";
  if (detailsScol) detailsScol.style.display = nbE > 0 ? "" : "none";
}

// -----------------------------------------------------------------------------
// 5. COLLECTE DES DONNÉES — PROFIL
// -----------------------------------------------------------------------------
function buildProfil() {
  const situation = radioVal("situation") || "celibataire";
  const enfants = $$(".enfant-item").map((item, i) => ({
    garde: $(`select[name^="enfant_garde"]`, item)?.value || "exclusive",
  }));
  return {
    situation,
    enfants,
    invalidite: val('input[name="invalidite"]:checked') === "true",
    ancienCombattant: val('input[name="ancienCombattant"]:checked') === "true",
  };
}

// -----------------------------------------------------------------------------
// 6. COLLECTE DES DONNÉES — DÉCLARANT
// -----------------------------------------------------------------------------
function buildDeclarant(suffix) {
  const d = {
    salaireNet: numVal(`#salaireNet_${suffix}`),
    salaireBrut: numVal(`#salaireBrut_${suffix}`),
    pasVerse: numVal(`#pasVerse_${suffix}`),
    pfuVerseCase2CK: numVal(`#pfuVerse_${suffix}`),
    autresRevenus: {
      pensionsRetraites: numVal(`#pensionsRetraites_${suffix}`),
      rcmBrut: numVal(`#rcmBrut_${suffix}`),
    },
  };

  if (val(`input[name="utiliseKm_${suffix}"]:checked`) === "oui") {
    d.km = {
      cv: numVal(`#km_cv_${suffix}`),
      kmAllerSimple: numVal(`#km_aller_${suffix}`),
      jours: numVal(`#km_jours_${suffix}`),
      typeVehicule: val(`#km_type_${suffix}`) || "thermique",
      peages: numVal(`#km_peages_${suffix}`),
      parking: numVal(`#km_parking_${suffix}`),
      kmProsSupplementaires: numVal(`#km_pros_${suffix}`),
    };
  }

  if (val(`input[name="utiliseRepas_${suffix}"]:checked`) === "oui") {
    d.repas = {
      avecJustificatifs: val(`input[name="repas_justificatifs_${suffix}"]:checked`) === "oui",
      coutRepasJour: numVal(`#repas_cout_${suffix}`),
      partPatronaleJour: numVal(`#repas_patronal_${suffix}`),
      jours: numVal(`#repas_jours_${suffix}`),
    };
  }

  const autresF = {
    materiel: numVal(`#frais_materiel_${suffix}`),
    formation: numVal(`#frais_formation_${suffix}`),
    vetements: numVal(`#frais_vetements_${suffix}`),
    documentation: numVal(`#frais_documentation_${suffix}`),
    doubleResidence: numVal(`#frais_doubleresidence_${suffix}`),
    joursTeletravail: numVal(`#frais_teletravail_${suffix}`),
    cotisationsSyndicales: numVal(`#frais_syndicat_${suffix}`),
  };
  const totalAutres = Object.values(autresF).reduce((s, v) => s + v, 0);
  if (totalAutres > 0) d.autres = autresF;

  return d;
}

// -----------------------------------------------------------------------------
// 7. COLLECTE DES DONNÉES — CRÉDITS
// -----------------------------------------------------------------------------
function buildCreditsData(cryptoFoyer = null) {
  const credits = {};

  const gardes = $$(".enfant-item").map((item, i) => ({
    depensesNettes: numVal(`#garde_depenses_${i + 1}`),
    typeGarde: $(`select[name^="enfant_garde"]`, item)?.value || "exclusive",
  })).filter(g => g.depensesNettes > 0);
  if (gardes.length) credits.gardes = gardes;

  const dom = {
    menageRepassage: numVal("#dom_menage"),
    jardinage: numVal("#dom_jardinage"),
    soutienScolaire: numVal("#dom_soutien"),
    assistanceInfo: numVal("#dom_info"),
    aidePersonneAgee: numVal("#dom_dependance"),
    petitBricolage: numVal("#dom_bricolage"),
    plus65ans: val('input[name="dom_plus65"]:checked') === "oui",
    personneDependante: numVal("#dom_dependance") > 0,
  };
  if (Object.values(dom).some(v => v && v !== false)) credits.servicesDomicile = dom;

  const dons = {
    aidePersonnes: numVal("#dons_aide"),
    interetGeneral: numVal("#dons_interet"),
    partisPolitiques: numVal("#dons_partis"),
    recherche: numVal("#dons_recherche"),
  };
  if (Object.values(dons).some(v => v > 0)) credits.dons = dons;

  const scolarite = {
    nbCollege: numVal("#scol_college"),
    nbLycee: numVal("#scol_lycee"),
    nbSuperieur: numVal("#scol_superieur"),
  };
  if (Object.values(scolarite).some(v => v > 0)) credits.scolarite = scolarite;

  const montantSyndicat = numVal("#syndicat_montant");
  if (montantSyndicat > 0) credits.syndicat = { montant: montantSyndicat };

  const ehpadDepenses = numVal("#ehpad_depenses");
  if (ehpadDepenses > 0) credits.ehpad = { depenses: ehpadDepenses, nbPersonnes: numVal("#ehpad_nb") || 1 };

  if (cryptoFoyer && (cryptoFoyer.plusValue > 0 || cryptoFoyer.moinsValue > 0)) {
    credits.crypto = cryptoFoyer;
  }

  return credits;
}

// -----------------------------------------------------------------------------
// 8. COLLECTE DES OPTIONS (mariage/PACS première année)
// -----------------------------------------------------------------------------
function buildOptions() {
  const situation = radioVal("situation");
  const estCouple = ["marie", "pacse"].includes(situation);
  const premiereAnneeUnion = estCouple && radioVal("premiereAnneeUnion") === "oui";
  let modeDeclaration = "commune";
  if (premiereAnneeUnion) {
    modeDeclaration = radioVal("modeDeclaration") || "comparatif";
  }
  const repartitionCommuns = {
    revenus: parseFloat(val("#repartition_revenus") || "0.5"),
    charges: parseFloat(val("#repartition_charges") || "0.5"),
  };

  const cryptoD1 = {
    plusValue: numVal("#crypto_pv_d1"),
    moinsValue: numVal("#crypto_mv_d1"),
    bareme: radioVal("crypto_bareme_d1") || "flat",
    comptesEtrangers: radioVal("crypto_comptes_d1") === "oui",
  };
  const cryptoD2 = {
    plusValue: numVal("#crypto_pv_d2"),
    moinsValue: numVal("#crypto_mv_d2"),
    bareme: radioVal("crypto_bareme_d2") || "flat",
    comptesEtrangers: radioVal("crypto_comptes_d2") === "oui",
  };
  const cryptoFoyer = {
    plusValue: cryptoD1.plusValue + cryptoD2.plusValue,
    moinsValue: cryptoD1.moinsValue + cryptoD2.moinsValue,
    bareme: cryptoD1.bareme === "progressif" || cryptoD2.bareme === "progressif" ? "progressif" : "flat",
    comptesEtrangers: cryptoD1.comptesEtrangers || cryptoD2.comptesEtrangers,
  };

  return { modeDeclaration, premiereAnneeUnion, repartitionCommuns, crypto: cryptoFoyer };
}

// -----------------------------------------------------------------------------
// 9. SIMULATION PRINCIPALE
// -----------------------------------------------------------------------------
function simuler() {
  try {
    calculDejaLance = true;
    if (timerAutoCalc) { clearTimeout(timerAutoCalc); timerAutoCalc = null; }
    const profil = buildProfil();
    const options = buildOptions();
    const situation = profil.situation;
    const estCouple = ["marie", "pacse"].includes(situation);
    const fraisData = { d1: buildDeclarant("d1") };
    if (estCouple) fraisData.d2 = buildDeclarant("d2");
    const creditsData = buildCreditsData(options.crypto);
    const resultat = calculerResultat(profil, fraisData, creditsData, options);
    afficherResultats(resultat, options);
    afficherEtape(6);
  } catch (err) {
    console.error("Erreur simulation :", err);
    afficherErreur("Une erreur est survenue lors du calcul. Vérifiez vos saisies.");
  }
}

// -----------------------------------------------------------------------------
// 10. RENDU DES RÉSULTATS
// -----------------------------------------------------------------------------
function afficherResultats(resultat, options) {
  const container = $("#zone-resultats");
  if (!container) return;
  if (resultat.mode === "comparatif") {
    container.innerHTML = renderComparatif(resultat);
  } else if (resultat.mode === "separee") {
    container.innerHTML = renderSepare(resultat);
  } else {
    container.innerHTML = renderCommun(resultat);
  }
}

// -----------------------------------------------------------------------------
// HELPER — BLOC FRAIS RÉELS (aide à la saisie impots.gouv.fr)
// -----------------------------------------------------------------------------
function labelVehicule(km, cv) {
  if (!km) return "";
  const types = {
    thermique: "Automobile thermique",
    electrique: "Automobile électrique (+20%)",
    moto: "Moto / Scooter",
    velo: "Vélo"
  };
  const type = types[km.typeVehicule] || "Automobile thermique";
  const cvLabel = (km.typeVehicule === "moto" || km.typeVehicule === "velo") ? "" : ` — ${cv || "?"} CV`;
  return `${type}${cvLabel}`;
}

function buildTexteJustificatif(details, frais, cv) {
  const { km, repas, autres } = details;
  let lignes = [];

  if (km && km.fraisKmTotal > 0) {
    lignes.push("FRAIS KILOMÉTRIQUES :");
    lignes.push(`  Véhicule : ${labelVehicule(km, cv)}`);
    if (km.estPlafonne) {
      lignes.push(`  ⚠️ Distance plafonnée à 40 km aller (règle fiscale)`);
    }
    if (km.kmDomicileTravail > 0) {
      const allerRetenu = km.kmAllerSimpleRetenu;
      const jours = Math.round(km.kmDomicileTravail / (allerRetenu * 2));
      lignes.push(`  Trajet domicile ↔ travail : ${allerRetenu} km × 2 × ${jours} jours = ${km.kmDomicileTravail} km`);
    }
    if (km.kmProsSupplementaires > 0) {
      lignes.push(`  Km professionnels supplémentaires : ${km.kmProsSupplementaires} km`);
    }
    lignes.push(`  Total km : ${km.kmTotal} km`);
    lignes.push(`  Frais kilométriques retenus : ${eur(km.fraisKmBrut)}${km.majoration > 0 ? ` + majoration électrique ${eur(km.majoration)}` : ""}`);
    if (km.peages > 0) lignes.push(`  Péages : ${eur(km.peages)}`);
    if (km.parking > 0) lignes.push(`  Parking : ${eur(km.parking)}`);
    lignes.push(`  → Sous-total frais km : ${eur(km.fraisKmTotal)}`);
    lignes.push("");
  }

  const autresLignes = [];
  if (repas && repas.fraisRepasNet > 0) {
    autresLignes.push("  Repas :");
    const netParJour = repas.netParJour || 0;
    const jours = netParJour > 0 ? Math.round(repas.fraisRepasNet / netParJour) : 0;
    if (repas.avecJustificatifs) {
      autresLignes.push(`    ${jours} jours × (${eur(repas.coutRetenuJour)} payé − 5,45 € domicile${repas.avantageTRJour > 0 ? ` − ${eur(repas.avantageTRJour)} ticket-restaurant` : ""}) = ${eur(netParJour)}/j`);
    } else {
      autresLignes.push(`    ${jours} jours × ${eur(netParJour)}/j (forfait sans justificatifs)`);
    }
    autresLignes.push(`    Sous-total repas : ${eur(repas.fraisRepasNet)}`);
  }

  if (autres && autres.totalAutresFrais > 0) {
    const d = autres.detailFrais;
    autresLignes.push("  Autres frais professionnels :");
    if (d.materiel > 0) autresLignes.push(`    Matériel / équipement : ${eur(d.materiel)}`);
    if (d.formation > 0) autresLignes.push(`    Formation : ${eur(d.formation)}`);
    if (d.vetements > 0) autresLignes.push(`    Vêtements professionnels : ${eur(d.vetements)}`);
    if (d.documentation > 0) autresLignes.push(`    Documentation : ${eur(d.documentation)}`);
    if (d.doubleResidence > 0) autresLignes.push(`    Double résidence : ${eur(d.doubleResidence)}`);
    if (d.fraisTeletravail > 0) autresLignes.push(`    Télétravail (forfait 2,60 €/j) : ${eur(d.fraisTeletravail)}`);
    if (d.cotisationsSyndicales > 0) autresLignes.push(`    Cotisations syndicales : ${eur(d.cotisationsSyndicales)}`);
  }

  const totalAutres = (repas?.fraisRepasNet || 0) + (autres?.totalAutresFrais || 0);
  if (autresLignes.length > 0) {
    lignes.push("AUTRES FRAIS PROFESSIONNELS :");
    lignes.push(...autresLignes);
    lignes.push(`  → Sous-total autres frais : ${eur(totalAutres)}`);
    lignes.push("");
  }

  lignes.push(`TOTAL FRAIS RÉELS : ${eur(frais.totalFraisReels)}`);
  return lignes.join("\n");
}

function renderFraisReels(frais, details, suffixe, caseKm, caseAutres, inputSuffix) {
  const cv = numVal(`#km_cv_${inputSuffix}`);

  const aucunFrais = !details || (
    (!details.km || details.km.fraisKmTotal === 0) &&
    (!details.repas || details.repas.fraisRepasNet === 0) &&
    (!details.autres || details.autres.totalAutresFrais === 0)
  );

  if (aucunFrais) {
    return `
    <details class="detail-section">
      <summary>Déclarant ${suffixe} - Abattement 10 %</summary>
      <div class="frais-alerte frais-alerte-neutre">
        Abattement forfaitaire de 10 % appliqué : <strong>${eur(frais.abattement)}</strong>.
        Rien à saisir dans les frais réels.
      </div>
    </details>
  `;
  }

  if (!frais.fraisReelsPlusAvantageux) {
    return `
    <details class="detail-section">
      <summary>Déclarant ${suffixe} - Abattement 10 % retenu</summary>
      <div class="frais-alerte">
        ⚠️ L'abattement forfaitaire de 10 % <strong>(${eur(frais.abattement)})</strong> est plus avantageux
        que vos frais réels <strong>(${eur(frais.totalFraisReels)})</strong>.<br>
        Le simulateur a retenu l'abattement automatique — <strong>vous n'avez rien à saisir</strong>
        dans les frais réels sur impots.gouv.fr.
      </div>
    </details>
  `;
  }

  const fraisKm = details.km?.fraisKmTotal || 0;
  const totalAutres = (details.repas?.fraisRepasNet || 0) + (details.autres?.totalAutresFrais || 0);
  const fraisKmArrondi = Math.round(fraisKm);
  const totalAutresArrondi = Math.round(totalAutres);
  const totalArrondi = Math.round(frais.totalFraisReels);
  const texte = buildTexteJustificatif(details, frais, cv);
  const idTexte = `texte-justif-${suffixe}`;

  return `
  <details class="detail-section">
    <summary>Déclarant ${suffixe} - Frais réels à saisir</summary>
    <p class="frais-reels-intro">
      Vos frais réels <strong>(${eur(frais.totalFraisReels)})</strong> dépassent l'abattement forfaitaire
      <strong>(${eur(frais.abattement)})</strong>. Reportez les montants ci-dessous sur impots.gouv.fr.
    </p>
    <div class="frais-cases-grid">
      ${fraisKmArrondi > 0 ? `
      <div class="frais-case-item">
        <span class="frais-case-label">🚗 Frais kilométriques — Case <strong>${caseKm}</strong></span>
        <div class="frais-case-valeur-wrapper">
          <input type="text" class="frais-case-valeur" value="${fraisKmArrondi}" readonly>
          <button class="btn-copier-case" onclick="navigator.clipboard.writeText('${fraisKmArrondi}').then(() => this.textContent='✅').catch(() => {}); setTimeout(() => this.textContent='📋', 1500)" title="Copier">📋</button>
        </div>
        <span class="frais-case-hint">${labelVehicule(details.km, cv)} — ${details.km?.kmTotal || 0} km annuels</span>
      </div>
      ` : ""}
      ${totalAutresArrondi > 0 ? `
      <div class="frais-case-item">
        <span class="frais-case-label">🍽️ Autres frais — Case <strong>${caseAutres}</strong></span>
        <div class="frais-case-valeur-wrapper">
          <input type="text" class="frais-case-valeur" value="${totalAutresArrondi}" readonly>
          <button class="btn-copier-case" onclick="navigator.clipboard.writeText('${totalAutresArrondi}').then(() => this.textContent='✅').catch(() => {}); setTimeout(() => this.textContent='📋', 1500)" title="Copier">📋</button>
        </div>
        <span class="frais-case-hint">Repas + autres frais professionnels</span>
      </div>
      ` : ""}
      <div class="frais-case-item frais-case-total">
        <span class="frais-case-label">📌 Total frais réels — Case <strong>${caseKm}</strong> (total)</span>
        <div class="frais-case-valeur-wrapper">
          <input type="text" class="frais-case-valeur" value="${totalArrondi}" readonly>
          <button class="btn-copier-case" onclick="navigator.clipboard.writeText('${totalArrondi}').then(() => this.textContent='✅').catch(() => {}); setTimeout(() => this.textContent='📋', 1500)" title="Copier">📋</button>
        </div>
      </div>
    </div>
    <div class="frais-justif-section">
      <div class="frais-justif-header">
        <span>📝 Texte justificatif — à coller dans le champ "Détail" du formulaire</span>
        <button class="btn-copier-texte" onclick="
          navigator.clipboard.writeText(document.getElementById('${idTexte}').value)
            .then(() => { this.textContent='✅ Copié !'; setTimeout(() => this.textContent='📋 Copier le texte', 1500); })
            .catch(() => {});
        ">📋 Copier le texte</button>
      </div>
      <textarea id="${idTexte}" class="frais-justif-textarea" readonly rows="12">${texte}</textarea>
    </div>
  </details>
`;
}

// --- Rendu scénario commun ---
function renderCommun(r) {
  const soldeClass = r.solde > 0 ? "solde-positif" : r.solde < 0 ? "solde-negatif" : "solde-neutre";
  const soldeLabel = r.solde > 0 ? "Supplément à payer" : r.solde < 0 ? "Remboursement attendu" : "Soldé";
  const blocFraisD1 = renderFraisReels(r.fraisD1, r.detailsFraisD1, "1", "1AK", "1AK", "d1");
  const blocFraisD2 = r.fraisD2 ? renderFraisReels(r.fraisD2, r.detailsFraisD2, "2", "1BK", "1BK", "d2") : "";
  return `
    <div class="resultat-bloc resultat-commun">
      <h2>Résultat — Déclaration commune</h2>
      <div class="resultats-grid">
        <div class="carte-resultat"><span class="carte-label">Revenu net imposable</span><span class="carte-valeur">${eur(r.revenuNetImposable)}</span></div>
        <div class="carte-resultat"><span class="carte-label">Quotient familial</span><span class="carte-valeur">${r.nbParts} parts</span></div>
        <div class="carte-resultat"><span class="carte-label">Impôt brut</span><span class="carte-valeur">${eur(r.impotBrut)}</span></div>
        <div class="carte-resultat"><span class="carte-label">Décote appliquée</span><span class="carte-valeur">${eur(r.decote)}</span></div>
        <div class="carte-resultat highlight"><span class="carte-label">Impôt net</span><span class="carte-valeur">${eur(r.impotNet)}</span></div>
        <div class="carte-resultat"><span class="carte-label">PAS versé</span><span class="carte-valeur">${eur(r.pasTotal)}</span></div>
        <div class="carte-resultat ${soldeClass}"><span class="carte-label">${soldeLabel}</span><span class="carte-valeur">${eur(Math.abs(r.solde))}</span></div>
      </div>
      ${renderDetailTranches(r.detailTranches)}
      ${renderDetailCredits(r)}
      ${blocFraisD1}
      ${blocFraisD2}
      ${renderCases(r.cases)}
    </div>
  `;
}

// --- Rendu scénario séparé ---
function renderSepare(r) {
  const blocFraisD1 = renderFraisReels(r.result1.fraisD1, r.result1.detailsFraisD1, "1", "1AK", "1AK", "d1");
  const blocFraisD2 = renderFraisReels(r.result2.fraisD1, r.result2.detailsFraisD1, "2", "1BK", "1BK", "d2");
  return `
    <div class="resultat-bloc resultat-separe">
      <h2>Résultat — Déclarations séparées</h2>
      <div class="resultats-deux-colonnes">
        <div class="colonne-declarant"><h3>Déclarant 1</h3>${renderCartesSimplifie(r.result1)}</div>
        <div class="colonne-declarant"><h3>Déclarant 2</h3>${renderCartesSimplifie(r.result2)}</div>
      </div>
      <div class="total-separe">
        <h3>Total combiné</h3>
        <div class="resultats-grid">
          <div class="carte-resultat highlight"><span class="carte-label">Impôt net total</span><span class="carte-valeur">${eur(r.total.impotNet)}</span></div>
          <div class="carte-resultat"><span class="carte-label">PAS total</span><span class="carte-valeur">${eur(r.total.pasTotal)}</span></div>
          <div class="carte-resultat ${r.total.solde > 0 ? "solde-positif" : "solde-negatif"}">
            <span class="carte-label">${r.total.solde > 0 ? "À payer" : "À rembourser"}</span>
            <span class="carte-valeur">${eur(Math.abs(r.total.solde))}</span>
          </div>
        </div>
      </div>
      ${blocFraisD1}
      ${blocFraisD2}
    </div>
  `;
}

// --- Rendu scénario comparatif ---
function renderComparatif(r) {
  const meilleureCommune = r.best === "commune";
  const ecart = r.ecartImpotNet;
  const blocFraisD1 = renderFraisReels(r.commune.fraisD1, r.commune.detailsFraisD1, "1", "1AK", "1AK", "d1");
  const blocFraisD2 = r.commune.fraisD2
    ? renderFraisReels(r.commune.fraisD2, r.commune.detailsFraisD2, "2", "1BK", "1BK", "d2")
    : "";

  return `
    <div class="resultat-bloc resultat-comparatif">
      <h2>⚖️ Comparatif — Première année d'union</h2>
      <div class="verdict ${meilleureCommune ? "verdict-commune" : "verdict-separee"}">
        <span class="verdict-icone">${meilleureCommune ? "✅" : "💡"}</span>
        <span class="verdict-texte">${r.conseil}</span>
        <span class="verdict-ecart">Économie : <strong>${eur(ecart)}</strong></span>
      </div>
      <div class="comparatif-colonnes">
        <div class="colonne-scenario ${meilleureCommune ? "scenario-winner" : ""}">
          <h3>📋 Déclaration commune ${meilleureCommune ? "✅" : ""}</h3>
          <div class="resultats-grid">
            <div class="carte-resultat"><span class="carte-label">Revenu imposable</span><span class="carte-valeur">${eur(r.commune.revenuNetImposable)}</span></div>
            <div class="carte-resultat highlight"><span class="carte-label">Impôt net</span><span class="carte-valeur">${eur(r.commune.impotNet)}</span></div>
            <div class="carte-resultat"><span class="carte-label">PAS versé</span><span class="carte-valeur">${eur(r.commune.pasTotal)}</span></div>
            <div class="carte-resultat ${r.commune.solde > 0 ? "solde-positif" : "solde-negatif"}">
              <span class="carte-label">${r.commune.solde > 0 ? "À payer" : "À rembourser"}</span>
              <span class="carte-valeur">${eur(Math.abs(r.commune.solde))}</span>
            </div>
          </div>
          ${renderDetailTranches(r.commune.detailTranches)}
        </div>
        <div class="colonne-scenario ${!meilleureCommune ? "scenario-winner" : ""}">
          <h3>📋 Déclarations séparées ${!meilleureCommune ? "✅" : ""}</h3>
          <div class="resultats-grid">
            <div class="carte-resultat highlight"><span class="carte-label">Impôt net total</span><span class="carte-valeur">${eur(r.separee.total.impotNet)}</span></div>
            <div class="carte-resultat"><span class="carte-label">PAS total</span><span class="carte-valeur">${eur(r.separee.total.pasTotal)}</span></div>
            <div class="carte-resultat ${r.separee.total.solde > 0 ? "solde-positif" : "solde-negatif"}">
              <span class="carte-label">${r.separee.total.solde > 0 ? "À payer" : "À rembourser"}</span>
              <span class="carte-valeur">${eur(Math.abs(r.separee.total.solde))}</span>
            </div>
          </div>
          <div class="resultats-deux-colonnes">
            <div><h4>Déclarant 1</h4>${renderCartesSimplifie(r.separee.result1)}</div>
            <div><h4>Déclarant 2</h4>${renderCartesSimplifie(r.separee.result2)}</div>
          </div>
        </div>
      </div>
      <div class="detail-commun">
        <h3>Détail — Scénario retenu : ${meilleureCommune ? "Commune" : "Séparé"}</h3>
        ${meilleureCommune ? renderDetailCredits(r.commune) + renderCases(r.commune.cases) : ""}
        ${!meilleureCommune ? renderCases(r.separee.result1.cases) : ""}
        ${blocFraisD1}
        ${blocFraisD2}
      </div>
    </div>
  `;
}

// --- Cartes simplifiées pour sous-déclarants ---
function renderCartesSimplifie(r) {
  const solde = r.solde;
  return `
    <div class="resultats-grid compact">
      <div class="carte-resultat"><span class="carte-label">Revenu imposable</span><span class="carte-valeur">${eur(r.revenuNetImposable)}</span></div>
      <div class="carte-resultat highlight"><span class="carte-label">Impôt net</span><span class="carte-valeur">${eur(r.impotNet)}</span></div>
      <div class="carte-resultat ${solde > 0 ? "solde-positif" : "solde-negatif"}">
        <span class="carte-label">${solde > 0 ? "À payer" : "À rembourser"}</span>
        <span class="carte-valeur">${eur(Math.abs(solde))}</span>
      </div>
    </div>
  `;
}

// --- Détail des tranches ---
function renderDetailTranches(tranches) {
  if (!tranches || !tranches.length) return "";
  return `
    <details class="detail-section">
      <summary>Détail des tranches d'imposition</summary>
      <table class="tableau-tranches">
        <thead><tr><th>Taux</th><th>Base imposable</th><th>Impôt</th></tr></thead>
        <tbody>
          ${tranches.map(t => `<tr><td>${(t.taux * 100).toFixed(0)} %</td><td>${eur(t.baseImposable)}</td><td>${eur(t.impot)}</td></tr>`).join("")}
        </tbody>
      </table>
    </details>
  `;
}

// --- Détail des crédits et réductions ---
function renderDetailCredits(r) {
  const lignes = [
    ["Garde d'enfants", r.creditGardeTotal],
    ["Services domicile", r.creditServicesDomicile],
    ["Dons", r.reductionDonsTotal],
    ["Scolarité", r.reductionScolariteTotal],
    ["Syndicat", r.creditSyndicat],
    ["EHPAD", r.reductionEhpad],
    ["PFU déjà versé (2CK)", r.pfuDejaVerse],
  ].filter(([, v]) => v && v > 0);

  const cryptoDet = r.detailsCredits?.crypto;
  const cryptoHtml = cryptoDet && !cryptoDet.exonere && cryptoDet.impotCryptoTotal > 0
    ? `<details class="detail-section" style="margin-top:8px">
        <summary>Impôt sur plus-values crypto — ${eur(cryptoDet.impotCryptoTotal)}</summary>
        <table class="tableau-credits">
          <tbody>
            <tr><td>Plus-value nette</td><td>${eur(cryptoDet.pvNette)}</td></tr>
            <tr><td>Impôt IR (${cryptoDet.bareme === "flat" ? "12,8% Flat Tax" : "Barème progressif"})</td><td>${eur(cryptoDet.impotIR)}</td></tr>
            <tr><td>Prélèvements sociaux (17,2%)</td><td>${eur(cryptoDet.prelevementsSociaux)}</td></tr>
            <tr class="total-ligne"><td><strong>Total crypto</strong></td><td><strong>${eur(cryptoDet.impotCryptoTotal)}</strong></td></tr>
          </tbody>
        </table>
      </details>`
    : cryptoDet?.exonere && cryptoDet.pvNette > 0
      ? `<p class="hint" style="margin-top:8px">Plus-value crypto de ${eur(cryptoDet.pvNette)} — <strong>exonérée</strong> (sous le seuil de 305 €)</p>`
      : "";

  if (!lignes.length && !cryptoHtml) return "";
  if (!lignes.length) return cryptoHtml;

  return `
    <details class="detail-section">
      <summary>Crédits et réductions d'impôt</summary>
      <table class="tableau-credits">
        <thead><tr><th>Nature</th><th>Montant</th></tr></thead>
        <tbody>
          ${lignes.map(([label, val]) => `<tr><td>${label}</td><td>${eur(val)}</td></tr>`).join("")}
          <tr class="total-ligne"><td><strong>Total</strong></td><td><strong>${eur(r.totalCreditsReductions)}</strong></td></tr>
        </tbody>
      </table>
    </details>
    ${cryptoHtml}
  `;
}

// --- Cases fiscales ---
function renderCases(cases) {
  const entrees = Object.entries(cases);
  if (!entrees.length) return "";

  const LABELS_CASES = {
    // --- Traitements & Salaires ---
    "1AJ": "Traitements et salaires — Déclarant 1",
    "1BJ": "Traitements et salaires — Déclarant 2",
    "1CJ": "Traitements et salaires — Pers. à charge 1",
    "1DJ": "Traitements et salaires — Pers. à charge 2",
    "1AA": "Salaires employés par particulier employeur — Déclarant 1",
    "1BA": "Salaires employés par particulier employeur — Déclarant 2",
    "1GA": "Abattement assistants maternels / journalistes — Déclarant 1",
    "1HA": "Abattement assistants maternels / journalistes — Déclarant 2",
    "1GH": "Heures supplémentaires / RTT exonérés — Déclarant 1",
    "1HH": "Heures supplémentaires / RTT exonérés — Déclarant 2",
    "1PB": "Pourboires exonérés — Déclarant 1",
    "1PC": "Pourboires exonérés — Déclarant 2",
    "1AD": "Prime de partage de la valeur exonérée — Déclarant 1",
    "1BD": "Prime de partage de la valeur exonérée — Déclarant 2",
    "1GB": "Rémunérations associés et gérants art. 62 CGI — Déclarant 1",
    "1HB": "Rémunérations associés et gérants art. 62 CGI — Déclarant 2",
    "1GF": "Droits d'auteur / fonctionnaires chercheurs — Déclarant 1",
    "1HF": "Droits d'auteur / fonctionnaires chercheurs — Déclarant 2",
    "1AP": "Allocations chômage / préretraite — Déclarant 1",
    "1BP": "Allocations chômage / préretraite — Déclarant 2",
    "1AF": "Salaires source étrangère (crédit impôt égal à l'impôt français) — Déclarant 1",
    "1BF": "Salaires source étrangère (crédit impôt égal à l'impôt français) — Déclarant 2",
    "1AG": "Autres salaires imposables de source étrangère — Déclarant 1",
    "1BG": "Autres salaires imposables de source étrangère — Déclarant 2",
    // Frais réels
    "1AK": "Frais réels — Déclarant 1",
    "1BK": "Frais réels — Déclarant 2",
    "1CK": "Frais réels — Pers. à charge 1",
    "1DK": "Frais réels — Pers. à charge 2",
    // --- Pensions, retraites & rentes ---
    "1AS": "Pensions, retraites et rentes — Déclarant 1",
    "1BS": "Pensions, retraites et rentes — Déclarant 2",
    "1CS": "Pensions, retraites et rentes — Pers. à charge 1",
    "1DS": "Pensions, retraites et rentes — Pers. à charge 2",
    "1AT": "Pensions de retraite en capital taxables à 7,5 % — Déclarant 1",
    "1BT": "Pensions de retraite en capital taxables à 7,5 % — Déclarant 2",
    // --- Revenus des capitaux mobiliers (RCM) ---
    "2DC": "Revenus de capitaux mobiliers (dividendes, intérêts bruts)",
    "2FU": "Revenus déjà soumis aux prélèvements sociaux",
    "2CH": "Produits des contrats d'assurance-vie et de capitalisation",
    "2TS": "Revenus mobiliers imposables au barème progressif",
    "2TR": "Intérêts et produits de placements à revenu fixe",
    "2TT": "Revenus distribués dans le cadre d'un PEA",
    "2AB": "Crédits d'impôt sur valeurs étrangères",
    "2CG": "Revenus exonérés retenus pour le calcul du taux effectif",
    "2BH": "Revenus des obligations",
    "2CK": "PFU / Flat Tax déjà versé (acompte sur RCM)",
    "2OP": "Option imposition au barème progressif pour les revenus mobiliers",
    // --- Plus-values & gains divers ---
    "3VG": "Plus-values mobilières imposables (cessions de valeurs mobilières)",
    "3VH": "Moins-values mobilières de l'année",
    "3VT": "Plus-values et créances — exil fiscal (exit tax)",
    "3SZ": "Gains de levée d'options sur titres",
    "3AN": "Plus-values numériques (crypto) — Flat Tax 12,8 %",
    "3BN": "Plus-values numériques (crypto) — Barème progressif",
    "3CN": "Moins-values numériques (crypto) imputables",
    // --- Revenus fonciers ---
    "4BA": "Revenus fonciers nets (régime réel — déclaration 2044)",
    "4BB": "Déficit foncier imputable sur le revenu global",
    "4BC": "Déficit foncier imputable sur les seuls revenus fonciers",
    "4BD": "Déficits fonciers antérieurs non encore imputés",
    "4BE": "Revenus fonciers bruts (micro-foncier)",
    // --- BIC / BNC (professions non salariées) ---
    "5KN": "BNC — Bénéfices non commerciaux (déclaration contrôlée) — Déclarant 1",
    "5LN": "BNC — Bénéfices non commerciaux (déclaration contrôlée) — Déclarant 2",
    "5HQ": "BIC — Bénéfices industriels et commerciaux (professionnel) — Déclarant 1",
    "5IQ": "BIC — Bénéfices industriels et commerciaux (professionnel) — Déclarant 2",
    // --- Prélèvement à la source (PAS) ---
    "8HV": "PAS retenu à la source sur salaires — Déclarant 1",
    "8IV": "PAS retenu à la source sur salaires — Déclarant 2",
    "8HW": "PAS retenu à la source sur pensions / retraites — Déclarant 1",
    "8IW": "PAS retenu à la source sur pensions / retraites — Déclarant 2",
    "8HX": "PAS retenu à la source sur autres revenus — Déclarant 1",
    "8IX": "PAS retenu à la source sur autres revenus — Déclarant 2",
    "8TA": "Acomptes de PAS versés sur revenus non salariaux",
    // --- Dons (2042) ---
    "7UD": "Dons — organismes d'aide aux personnes en difficulté",
    "7UF": "Dons — aide aux victimes de violences domestiques",
    "7XS": "Dons — partis ou groupements politiques",
    "7AC": "Dons — organismes d'intérêt général (66 %)",
    "7AE": "Dons — associations cultuelles ou de bienfaisance",
    "7AG": "Dons — organismes agréés établis dans l'UE",
    "7VA": "Dons — Fondation du Patrimoine",
    // --- Emploi à domicile & garde d'enfants ---
    "7DB": "Garde d'enfant(s) de moins de 6 ans hors domicile",
    "7DF": "Garde hors domicile — enfant(s) en résidence alternée",
    "7DD": "Emploi d'un salarié à domicile (services à la personne)",
    // --- Scolarité ---
    "7EA": "Scolarité — enfant(s) au collège",
    "7EB": "Scolarité — enfant(s) au lycée",
    "7EC": "Scolarité — enfant(s) dans le supérieur",
    "7EF": "Scolarité — enfant(s) au lycée (résidence alternée)",
    "7EG": "Scolarité — enfant(s) dans le supérieur (résidence alternée)",
    // --- Syndicat ---
    "7SF": "Cotisations syndicales — salariés et pensionnés",
    // --- EHPAD / dépendance ---
    "7CD": "EHPAD — dépenses pour personnes dépendantes",
    "7CE": "EHPAD — dépenses en résidence alternée",
    // --- Épargne retraite (PER) ---
    "6NS": "Cotisations PER individuel déductibles — Déclarant 1",
    "6NT": "Cotisations PER individuel déductibles — Déclarant 2",
    "6PS": "Cotisations PER collectif (versements employeur) — Déclarant 1",
    "6PT": "Cotisations PER collectif (versements employeur) — Déclarant 2",
    // --- Investissement locatif ---
    "7GH": "Réduction Pinel — métropole",
    "7QA": "Réduction Denormandie",
    // --- Divers ---
    "7WJ": "Crédit d'impôt formation du chef d'entreprise",
    "8TK": "Revenus de source étrangère ouvrant droit à crédit d'impôt (report 2047)",
    "8HZ": "Prélèvements sociaux déjà versés sur revenus du patrimoine",
    "2AA": "Gains et distributions taxables à 19 %",
    "3WA": "Prélèvements sociaux afférents aux revenus de l'année",
  };

  return `
    <details class="detail-section">
      <summary>Cases de la déclaration</summary>
      <table class="tableau-cases">
        <thead>
          <tr>
            <th>Libellé</th>
            <th>Case</th>
            <th>Valeur</th>
          </tr>
        </thead>
        <tbody>
          ${entrees.map(([k, v]) => `
            <tr>
              <td>${LABELS_CASES[k] || "—"}</td>
              <td><strong>${k}</strong></td>
              <td>${typeof v === "number" ? eur(v) : v}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </details>
  `;
}

// --- Erreur ---
function afficherErreur(message) {
  const container = $("#zone-resultats");
  if (container) container.innerHTML = `<div class="erreur-bloc">${message}</div>`;
  afficherEtape(6);
}

// -----------------------------------------------------------------------------
// 11. RÉINITIALISATION
// -----------------------------------------------------------------------------
function reinitialiser() {
  const form = $("#simulateur");
  if (form) form.reset();
  const listeEnfants = $("#liste-enfants");
  if (listeEnfants) listeEnfants.innerHTML = "";
  nbEnfants = 0;
  calculDejaLance = false;
  if (timerAutoCalc) { clearTimeout(timerAutoCalc); timerAutoCalc = null; }
  afficherEtape(1);
}

// -----------------------------------------------------------------------------
// 12. INITIALISATION AU CHARGEMENT
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  afficherEtape(1);

  $$(".btn-suivant").forEach(btn => btn.addEventListener("click", etapeSuivante));
  $$(".btn-precedent").forEach(btn => btn.addEventListener("click", etapePrecedente));

  const btnSimuler = $("#btn-simuler");
  if (btnSimuler) btnSimuler.addEventListener("click", simuler);

  const btnSimulerBas = $("#btn-simuler-bas");
  if (btnSimulerBas) btnSimulerBas.addEventListener("click", simuler);

  const btnReset = $("#btn-reinitialiser");
  if (btnReset) btnReset.addEventListener("click", reinitialiser);

  const btnAjouterEnfant = $("#btn-ajouter-enfant");
  if (btnAjouterEnfant) btnAjouterEnfant.addEventListener("click", ajouterEnfant);

  $$("input[name='situation']").forEach(el => el.addEventListener("change", () => {
    majVisibiliteChampsConjoint();
    majVisibiliteChampsUnion();
  }));

  $$("input[name='premiereAnneeUnion']").forEach(el => el.addEventListener("change", majVisibiliteChampsUnion));

  ["d1", "d2"].forEach(suffix => {
    $$(`input[name="utiliseKm_${suffix}"]`).forEach(el => el.addEventListener("change", () => majVisibiliteFraisKm(suffix)));
    $$(`input[name="utiliseRepas_${suffix}"]`).forEach(el => el.addEventListener("change", () => majVisibiliteFraisRepas(suffix)));
    $$(`input[name="repas_justificatifs_${suffix}"]`).forEach(el => el.addEventListener("change", () => majVisibiliteFraisRepas(suffix)));
  });

  document.addEventListener("input", (e) => {
    if (!e.target.matches("input, select, textarea")) return;
    calculDejaLance = false;
    maybeAutoCalculate();
  });

  majVisibiliteChampsConjoint();
  majVisibiliteChampsUnion();
  majVisibiliteFraisKm("d1");
  majVisibiliteFraisKm("d2");
  majVisibiliteFraisRepas("d1");
  majVisibiliteFraisRepas("d2");
  syncChampsEnfants();
  initAide();
});
