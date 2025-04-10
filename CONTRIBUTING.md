# 🤝 Contribuer à NeuroCode-IA-Full

Merci de ton intérêt pour contribuer à **NeuroCode-IA-Full** ! 🎉

## 🛠️ Comment contribuer

1. **Fork** le dépôt
2. **Clone** ton fork : `git clone https://github.com/votre-utilisateur/NeuroCode-IA-Full`
3. Crée une branche : `git checkout -b feature/ma-contribution`
4. Code et commit : `git commit -m "feat: ajoute ma fonctionnalité"`
5. Push vers ton fork : `git push origin feature/ma-contribution`
6. Ouvre une **Pull Request**

## 💡 Idées de contributions

- Amélioration de l'UI/UX
- Nouveaux fournisseurs IA
- Débogage de fonctionnalités existantes
- Documentation et tutoriels
- Tests unitaires et intégration

## 🧪 Tests

Merci d'écrire ou d'ajuster les tests associés à ton code quand c'est pertinent.

---

Merci encore 💜
"""

roadmap_md = """\
# 🛣️ Roadmap — NeuroCode-IA-Full

## ✅ Prochaines étapes

- [x] Interface de configuration en onglets
- [x] Support multi-fournisseurs IA (cloud & local)
- [x] Notifications et logs système
- [x] Déploiement Vercel/Netlify
- [x] Onboarding utilisateur

## 🔜 En cours

- [ ] Support Webhooks GitHub et Supabase
- [ ] Plugin de sauvegarde cloud
- [ ] Amélioration des performances initiales (lazy load, suspense)
- [ ] Extension VS Code

## 🧠 Idées futures

- [ ] Mode collaboratif multi-utilisateurs
- [ ] Intégration avec Langchain / Agents
- [ ] Analytics d’utilisation anonymisées
"""

security_md = """\
# 🔐 Politique de Sécurité

Nous prenons la sécurité de **NeuroCode-IA-Full** très au sérieux.

## 📬 Signaler une faille

Si tu découvres une vulnérabilité :

1. Ne la divulgue pas publiquement.
2. Contacte l’équipe de manière responsable :
   - **Email** : `security@moonback.ai`
   - **GitHub** : [@moonback](https://github.com/moonback)

## 🔐 Bonnes pratiques suivies

- Hash des mots de passe (si auth intégrée)
- Protection CSRF/SSR dans les API
- Utilisation de headers sécurisés (via Vercel/Netlify ou middleware)
- Limitation de l'accès aux clés d'API via `.env`

---

Merci de nous aider à garder cet outil sûr pour tout le monde 🙏
"""