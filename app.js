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

// ── AIDE CONTEXTUELLE ──
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
  // Sauter l'étape union si pas en couple
  if (prochaine === 5 && !estCouple) prochaine = 6;
  afficherEtape(prochaine);
}

function etapePrecedente() {
  const situation = radioVal("situation");
  const estCouple = ["marie", "pacse"].includes(situation);
  let precedente = etapeActuelle - 1;
  if (precedente === 5 && !estCouple) precedente = 4;
  if (precedente < 1) precedente = 1;
  afficherEtape(precedente);
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
  const hint      = $(`#hint-repas-cout-${suffix}`);

  if (!inputCout) return;

  if (utilise) {
    // Avec justificatifs : champ libre, vider le forfait
    inputCout.readOnly = false;
    inputCout.value    = "";
    inputCout.placeholder = "0 €";
    if (hint) hint.textContent = "";
  } else {
    // Sans justificatifs : pré-rempli à 5,45 €, verrouillé
    inputCout.readOnly = true;
    inputCout.value    = "5.45";
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
          '<label for="garde_depenses_' + i + '">Enfant ' + i + ' — Dépenses nettes de garde €</label>' +
          '<input type="number" id="garde_depenses_' + i + '" min="0" step="1" placeholder="0" />';
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
          '<label for="' + n.id + '">' + n.label + ' (max ' + nbE + ')</label>' +
          '<input type="number" id="' + n.id + '" min="0" max="' + nbE + '" step="1" placeholder="0" />';
        row.appendChild(div);
      });
      sectionScol.appendChild(row);
    }
  }

  // --- Masquer les sections si 0 enfant ---
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

  // Frais km
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

  // Frais repas
  if (val(`input[name="utiliseRepas_${suffix}"]:checked`) === "oui") {
    d.repas = {
      avecJustificatifs: val(`input[name="repas_justificatifs_${suffix}"]:checked`) === "oui",
      coutRepasJour: numVal(`#repas_cout_${suffix}`),
      partPatronaleJour: numVal(`#repas_patronal_${suffix}`),
      jours: numVal(`#repas_jours_${suffix}`),
    };
  }

  // Autres frais
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

  // Garde enfants
  const gardes = $$(".enfant-item").map((item, i) => ({
    depensesNettes: numVal(`#garde_depenses_${i + 1}`),
    typeGarde: $(`select[name^="enfant_garde"]`, item)?.value || "exclusive",
  })).filter(g => g.depensesNettes > 0);
  if (gardes.length) credits.gardes = gardes;

  // Services domicile
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

  // Dons
  const dons = {
    aidePersonnes: numVal("#dons_aide"),
    interetGeneral: numVal("#dons_interet"),
    partisPolitiques: numVal("#dons_partis"),
    recherche: numVal("#dons_recherche"),
  };
  if (Object.values(dons).some(v => v > 0)) credits.dons = dons;

  // Scolarité
  const scolarite = {
    nbCollege: numVal("#scol_college"),
    nbLycee: numVal("#scol_lycee"),
    nbSuperieur: numVal("#scol_superieur"),
  };
  if (Object.values(scolarite).some(v => v > 0)) credits.scolarite = scolarite;

  // Syndicat
  const montantSyndicat = numVal("#syndicat_montant");
  if (montantSyndicat > 0) credits.syndicat = { montant: montantSyndicat };

  // EHPAD
  const ehpadDepenses = numVal("#ehpad_depenses");
  if (ehpadDepenses > 0) credits.ehpad = { depenses: ehpadDepenses, nbPersonnes: numVal("#ehpad_nb") || 1 };

  // Crypto
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
  // Crypto D1
  const cryptoD1 = {
    plusValue: parseFloat(numVal("crypto_pv_d1")) || 0,
    moinsValue: parseFloat(numVal("crypto_mv_d1")) || 0,
    bareme: radioVal("crypto_bareme_d1") || "flat",
    comptesEtrangers: radioVal("crypto_comptes_d1") === "oui",
  };

  // Crypto D2 (si couple)
  const cryptoD2 = {
    plusValue: parseFloat(numVal("crypto_pv_d2")) || 0,
    moinsValue: parseFloat(numVal("crypto_mv_d2")) || 0,
    bareme: radioVal("crypto_bareme_d2") || "flat",
    comptesEtrangers: radioVal("crypto_comptes_d2") === "oui",
  };

  // Fusionner pour le foyer (les deux PV s'additionnent sur la même déclaration commune)
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

// --- Rendu scénario commun ---
function renderCommun(r) {
  const soldeClass = r.solde > 0 ? "solde-positif" : r.solde < 0 ? "solde-negatif" : "solde-neutre";
  const soldeLabel = r.solde > 0 ? "Supplément à payer" : r.solde < 0 ? "Remboursement attendu" : "Soldé";

  return `
    <div class="resultat-bloc resultat-commun">
      <h2>📊 Résultat — Déclaration commune</h2>

      <div class="resultats-grid">
        <div class="carte-resultat">
          <span class="carte-label">Revenu net imposable</span>
          <span class="carte-valeur">${eur(r.revenuNetImposable)}</span>
        </div>
        <div class="carte-resultat">
          <span class="carte-label">Quotient familial</span>
          <span class="carte-valeur">${r.nbParts} parts</span>
        </div>
        <div class="carte-resultat">
          <span class="carte-label">Impôt brut</span>
          <span class="carte-valeur">${eur(r.impotBrut)}</span>
        </div>
        <div class="carte-resultat">
          <span class="carte-label">Décote appliquée</span>
          <span class="carte-valeur">${eur(r.decote)}</span>
        </div>
        <div class="carte-resultat highlight">
          <span class="carte-label">Impôt net</span>
          <span class="carte-valeur">${eur(r.impotNet)}</span>
        </div>
        <div class="carte-resultat">
          <span class="carte-label">PAS versé</span>
          <span class="carte-valeur">${eur(r.pasTotal)}</span>
        </div>
        <div class="carte-resultat ${soldeClass}">
          <span class="carte-label">${soldeLabel}</span>
          <span class="carte-valeur">${eur(Math.abs(r.solde))}</span>
        </div>
      </div>

      ${renderDetailTranches(r.detailTranches)}
      ${renderDetailCredits(r)}
      ${renderCases(r.cases)}
    </div>
  `;
}

// --- Rendu scénario séparé ---
function renderSepare(r) {
  return `
    <div class="resultat-bloc resultat-separe">
      <h2>📊 Résultat — Déclarations séparées</h2>
      <div class="resultats-deux-colonnes">
        <div class="colonne-declarant">
          <h3>Déclarant 1</h3>
          ${renderCartesSimplifie(r.result1)}
        </div>
        <div class="colonne-declarant">
          <h3>Déclarant 2</h3>
          ${renderCartesSimplifie(r.result2)}
        </div>
      </div>
      <div class="total-separe">
        <h3>Total combiné</h3>
        <div class="resultats-grid">
          <div class="carte-resultat highlight">
            <span class="carte-label">Impôt net total</span>
            <span class="carte-valeur">${eur(r.total.impotNet)}</span>
          </div>
          <div class="carte-resultat">
            <span class="carte-label">PAS total</span>
            <span class="carte-valeur">${eur(r.total.pasTotal)}</span>
          </div>
          <div class="carte-resultat ${r.total.solde > 0 ? "solde-positif" : "solde-negatif"}">
            <span class="carte-label">${r.total.solde > 0 ? "À payer" : "À rembourser"}</span>
            <span class="carte-valeur">${eur(Math.abs(r.total.solde))}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- Rendu scénario comparatif ---
function renderComparatif(r) {
  const meilleureCommune = r.best === "commune";
  const ecart = r.ecartImpotNet;

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
            <div class="carte-resultat">
              <span class="carte-label">Revenu imposable</span>
              <span class="carte-valeur">${eur(r.commune.revenuNetImposable)}</span>
            </div>
            <div class="carte-resultat highlight">
              <span class="carte-label">Impôt net</span>
              <span class="carte-valeur">${eur(r.commune.impotNet)}</span>
            </div>
            <div class="carte-resultat">
              <span class="carte-label">PAS versé</span>
              <span class="carte-valeur">${eur(r.commune.pasTotal)}</span>
            </div>
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
            <div class="carte-resultat highlight">
              <span class="carte-label">Impôt net total</span>
              <span class="carte-valeur">${eur(r.separee.total.impotNet)}</span>
            </div>
            <div class="carte-resultat">
              <span class="carte-label">PAS total</span>
              <span class="carte-valeur">${eur(r.separee.total.pasTotal)}</span>
            </div>
            <div class="carte-resultat ${r.separee.total.solde > 0 ? "solde-positif" : "solde-negatif"}">
              <span class="carte-label">${r.separee.total.solde > 0 ? "À payer" : "À rembourser"}</span>
              <span class="carte-valeur">${eur(Math.abs(r.separee.total.solde))}</span>
            </div>
          </div>
          <div class="resultats-deux-colonnes">
            <div>
              <h4>Déclarant 1</h4>
              ${renderCartesSimplifie(r.separee.result1)}
            </div>
            <div>
              <h4>Déclarant 2</h4>
              ${renderCartesSimplifie(r.separee.result2)}
            </div>
          </div>
        </div>
      </div>

      <div class="detail-commun">
        <h3>Détail — Scénario retenu : ${meilleureCommune ? "Commune" : "Séparé"}</h3>
        ${meilleureCommune ? renderDetailCredits(r.commune) + renderCases(r.commune.cases) : ""}
        ${!meilleureCommune ? renderCases(r.separee.result1.cases) : ""}
      </div>
    </div>
  `;
}

// --- Cartes simplifiées pour sous-déclarants ---
function renderCartesSimplifie(r) {
  const solde = r.solde;
  return `
    <div class="resultats-grid compact">
      <div class="carte-resultat">
        <span class="carte-label">Revenu imposable</span>
        <span class="carte-valeur">${eur(r.revenuNetImposable)}</span>
      </div>
      <div class="carte-resultat highlight">
        <span class="carte-label">Impôt net</span>
        <span class="carte-valeur">${eur(r.impotNet)}</span>
      </div>
      <div class="carte-resultat ${solde > 0 ? "solde-positif" : "solde-negatif"}">
        <span class="carte-label">${solde > 0 ? "À payer" : "À rembourser"}</span>
        <span class="carte-valeur">${eur(Math.abs(solde))}</span>
      </div>
    </div>
  `;
}

// --- Détail des tranches ---
function renderDetailTranches(tranches = []) {
  if (!tranches.length) return "";
  return `
    <details class="detail-section">
      <summary>📈 Détail des tranches d'imposition</summary>
      <table class="tableau-tranches">
        <thead><tr><th>Taux</th><th>Base imposable</th><th>Impôt</th></tr></thead>
        <tbody>
          ${tranches.map(t => `
            <tr>
              <td>${(t.taux * 100).toFixed(0)} %</td>
              <td>${eur(t.baseImposable)}</td>
              <td>${eur(t.impot)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </details>
  `;
}

// --- Détail des crédits et réductions ---
function renderDetailCredits(r) {
  const lignes = [
    ["Garde d'enfant(s)", r.creditGardeTotal],
    ["Services à domicile", r.creditServicesDomicile],
    ["Dons", r.reductionDonsTotal],
    ["Scolarité", r.reductionScolariteTotal],
    ["Syndicat", r.creditSyndicat],
    ["EHPAD", r.reductionEhpad],
    ["PFU déjà versé (2CK)", r.pfuDejaVerse],
  ].filter(([, v]) => v && v > 0);

  const cryptoDet = r.detailsCredits?.crypto;
  const cryptoHtml = (cryptoDet && !cryptoDet.exonere && cryptoDet.impotCryptoTotal > 0) ? `
    <details class="detail-section" style="margin-top:8px">
      <summary>₿ Impôt sur plus-values crypto — ${eur(cryptoDet.impotCryptoTotal)}</summary>
      <table class="tableau-credits">
        <tbody>
          <tr><td>Plus-value nette</td><td>${eur(cryptoDet.pvNette)}</td></tr>
          <tr><td>Impôt IR (${cryptoDet.bareme === "flat" ? "12,8% Flat Tax" : "Barème progressif"})</td><td>${eur(cryptoDet.impotIR)}</td></tr>
          <tr><td>Prélèvements sociaux (17,2%)</td><td>${eur(cryptoDet.prelevementsSociaux)}</td></tr>
          <tr class="total-ligne"><td><strong>Total crypto</strong></td><td><strong>${eur(cryptoDet.impotCryptoTotal)}</strong></td></tr>
        </tbody>
      </table>
    </details>
  ` : (cryptoDet?.exonere && cryptoDet.pvNette > 0) ? `
    <p class="hint" style="margin-top:8px">
      ₿ Plus-value crypto de ${eur(cryptoDet.pvNette)} — <strong>exonérée</strong> (sous le seuil de 305 €)
    </p>
  ` : "";
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
function renderCases(cases = {}) {
  const entrees = Object.entries(cases);
  if (!entrees.length) return "";
  return `
    <details class="detail-section">
      <summary>Cases de la déclaration</summary>
      <table class="tableau-cases">
        <thead><tr><th>Case</th><th>Valeur</th></tr></thead>
        <tbody>
          ${entrees.map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${typeof v === "number" ? eur(v) : v}</td></tr>`).join("")}
        </tbody>
      </table>
    </details>
  `;
}

// --- Erreur ---
function afficherErreur(message) {
  const container = $("#zone-resultats");
  if (container) container.innerHTML = `<div class="erreur-bloc">⚠️ ${message}</div>`;
  afficherEtape(6);
}

// -----------------------------------------------------------------------------
// 11. REINITIALISATION
// -----------------------------------------------------------------------------

function reinitialiser() {
  const form = $("form#simulateur");
  if (form) form.reset();
  const listeEnfants = $("#liste-enfants");
  if (listeEnfants) listeEnfants.innerHTML = "";
  nbEnfants = 0;
  afficherEtape(1);
}

// -----------------------------------------------------------------------------
// 12. INITIALISATION AU CHARGEMENT
// -----------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  afficherEtape(1);

  // Boutons de navigation
  $$(".btn-suivant").forEach(btn => btn.addEventListener("click", etapeSuivante));
  $$(".btn-precedent").forEach(btn => btn.addEventListener("click", etapePrecedente));

  const btnSimuler = $("#btn-simuler");
  if (btnSimuler) btnSimuler.addEventListener("click", simuler);

  const btnReset = $("#btn-reinitialiser");
  if (btnReset) btnReset.addEventListener("click", reinitialiser);

  const btnAjouterEnfant = $("#btn-ajouter-enfant");
  if (btnAjouterEnfant) btnAjouterEnfant.addEventListener("click", ajouterEnfant);

  // Réactivité situation
  $$('input[name="situation"]').forEach(el =>
    el.addEventListener("change", () => {
      majVisibiliteChampsConjoint();
      majVisibiliteChampsUnion();
    })
  );

  // Réactivité première année union
  $$('input[name="premiereAnneeUnion"]').forEach(el =>
    el.addEventListener("change", majVisibiliteChampsUnion)
  );

  // Réactivité km / repas / justificatifs — D1 et D2
  ["d1", "d2"].forEach(suffix => {
    $$(`input[name="utiliseKm_${suffix}"]`).forEach(el =>
      el.addEventListener("change", () => majVisibiliteFraisKm(suffix))
    );
    $$(`input[name="utiliseRepas_${suffix}"]`).forEach(el =>
      el.addEventListener("change", () => majVisibiliteFraisRepas(suffix))
    );
    $$(`input[name="repas_justificatifs_${suffix}"]`).forEach(el =>
      el.addEventListener("change", () => majVisibiliteFraisRepas(suffix))
    );
  });

  // Init visibilité
  majVisibiliteChampsConjoint();
  majVisibiliteChampsUnion();
  majVisibiliteFraisKm("d1");
  majVisibiliteFraisKm("d2");
  majVisibiliteFraisRepas("d1");
  majVisibiliteFraisRepas("d2");
  syncChampsEnfants();
  initAide();
});