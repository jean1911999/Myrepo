# Analyse d'annonce immobilière

Application web d'aide à la décision pour l'investissement locatif en France : à partir des données d'une annonce, elle calcule la rentabilité et recommande le meilleur mode de location, le meilleur régime fiscal, la gestion et le financement.

## Étape 1 (cette version)

- Saisie manuelle des données de l'annonce, de votre situation et des hypothèses.
- Moteur de calcul isolé dans `src/engine` (TypeScript pur, sans dépendance) :
  - crédit et tableau d'amortissement, frais de garantie et de dossier, assurance ;
  - fiscalité : micro-foncier, réel foncier (déficit imputable et reportable), LMNP micro-BIC, LMNP réel (amortissements), SCI à l'IS ;
  - plus-value à la revente (abattements pour durée de détention, forfaits, réintégration des amortissements en LMNP, surtaxe) ;
  - TRI, rentabilités brute, nette et nette-nette, cash-flow, effort d'épargne, taux d'endettement (limite de 35 %) ;
  - optimisation : comparaison de toutes les combinaisons mode de location × régime × gestion × apport × durée ;
  - scénarios pessimiste, réaliste et optimiste, sensibilité, prix d'achat maximum pour une cible donnée ;
  - alertes DPE (calendrier d'interdiction de louer, gel des loyers).
- Barèmes et hypothèses par défaut centralisés dans `src/engine/config.ts`.

## Lancer

```bash
npm install
npm run dev     # application sur http://localhost:5173
npm test        # tests du moteur de calcul
npm run build
```

## Étapes suivantes

2. Données publiques et scoring multicritère sur 100.
3. Analyse des travaux et du gain de DPE.
4. Lecture d'annonce par lien et analyse par IA.
5. Recherche dans vos villes à partir des alertes e-mail des portails, alertes sur les meilleures annonces.
6. Comparateur, export PDF et Excel, comptes partagés.

Les barèmes fiscaux sont ceux des revenus 2025 et doivent être vérifiés à chaque loi de finances.
