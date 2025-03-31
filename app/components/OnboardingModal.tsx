import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import Cookies from 'js-cookie';
import { useStore } from '@nanostores/react';
import { profileStore, updateProfile } from '~/lib/stores/profile';

// Amélioration de la validation du username
const isValidUsername = (username: string): { valid: boolean; message?: string } => {
  if (username.length < 3) return { valid: false, message: "Le nom d'utilisateur doit contenir au moins 3 caractères." };
  if (username.length > 20) return { valid: false, message: "Le nom d'utilisateur ne peut pas dépasser 20 caractères." };
  if (!/^[a-zA-Z0-9_.-]*$/.test(username)) {
    return { valid: false, message: "Seuls les caractères alphanumériques, '_', '.' et '-' sont autorisés." };
  }
  return { valid: true };
};

export function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null); // Add username error state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profile = useStore(profileStore);
  const [isLoading, setIsLoading] = useState(false); // loading state
  const [currentStep, setCurrentStep] = useState<'welcome' | 'profile'>('welcome');

  useEffect(() => {
    // Check for existing cookies
    const apiKeys = Cookies.get('apiKeys');
    const userSettings = Cookies.get('userSettings');
    const onboardingSeen = Cookies.get('onboardingSeen');

    // Only show the modal if *none* of the relevant cookies are present
    if (!apiKeys && !userSettings && !onboardingSeen) {
      setIsOpen(true);
    }
  }, []);

  // Ajout d'un délai pour la validation du username
  const validateUsername = (username: string) => {
    const validation = isValidUsername(username);
    setUsernameError(validation.message || null);
    return validation.valid;
  };

  // Amélioration de la gestion de la fermeture
  const handleClose = () => {
    if (currentStep === 'profile' && !profile.username) {
      toast.error("Le nom d'utilisateur est requis pour continuer.", {
        autoClose: 3000,
        pauseOnHover: false
      });
      return;
    }
    
    if (!Cookies.get('onboardingSeen')) {
      Cookies.set('onboardingSeen', 'true', { 
        expires: 365,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production'
      });
    }
    
    setIsOpen(false);
  };

  // Amélioration de la gestion du profil
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const username = (formData.get('username') as string).trim();
    const bio = (formData.get('bio') as string).trim();

    if (!validateUsername(username)) {
      setIsLoading(false);
      return;
    }

    try {
      await updateProfile({
        username,
        bio,
        avatar: avatarPreview || profile.avatar,
      });
      
      toast.success("Profil mis à jour avec succès!", {
        autoClose: 2000,
        pauseOnHover: false
      });
      
      setIsEditingProfile(false);
    } catch (error: any) {
      console.error("Erreur lors de la mise à jour du profil:", error);
      toast.error(`Erreur : ${error.message || "Veuillez réessayer."}`, {
        autoClose: 4000
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Amélioration de la gestion de l'avatar
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérification du type de fichier
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error("Format d'image non supporté. Veuillez utiliser JPEG, PNG, GIF ou WEBP.");
      return;
    }

    // Vérification de la taille du fichier
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error("L'image est trop grande. Veuillez choisir une image de moins de 5 Mo.");
      return;
    }

    // Lecture du fichier
    const reader = new FileReader();
    reader.onloadstart = () => setIsLoading(true);
    reader.onload = () => {
      setAvatarPreview(reader.result as string);
      setIsLoading(false);
    };
    reader.onerror = () => {
      toast.error("Erreur lors de la lecture de l'image. Veuillez réessayer.");
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleStartWithoutProfile = () => {
    setIsOpen(false);
     // Don't set 'onboardingSeen' if we're just editing, only when it's first shown.
     if(!Cookies.get('onboardingSeen')){
      Cookies.set('onboardingSeen', 'true', { expires: 365 });
    }
  };

  // Added a check for profile.username to auto-switch to editing mode *if* the user
  // somehow got to this modal with no username.
  useEffect(() => {
    if (isOpen && !profile.username) {
      setCurrentStep('welcome');
    }
  }, [isOpen, profile.username]);

  // Nouvelle fonction pour passer à l'étape du profil
  const handleStartProfileSetup = () => {
    setCurrentStep('profile');
  };

  if (!isOpen) return null;


  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-labelledby="onboarding-modal-title"
        className="fixed inset-0 bg-black/70 backdrop-blur-lg flex items-center justify-center z-[100] p-4"
      >
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          role="document"
          className="bg-bolt-elements-background-depth-1 rounded-2xl p-8 w-full max-w-2xl border-2 border-bolt-elements-border/20 shadow-2xl relative backdrop-blur-[2px]"
        >
          <div className="flex items-center justify-between mb-8">
            <h2 id="onboarding-modal-title" className="text-2xl font-bold text-bolt-elements-textPrimary flex items-center gap-3">
              <div className="i-ph:sparkle w-6 h-6 text-green-400 bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text" />
              <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                {currentStep === 'profile' ? 'Personnalisez votre profil' : 'Bienvenue sur NeuroCode !'}
              </span>
            </h2>
            <button
              onClick={handleStartWithoutProfile}
              className="p-2 rounded-xl hover:bg-bolt-elements-background-depth-2 transition-all duration-200 text-bolt-elements-textSecondary hover:text-red-400 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500/50"
              aria-label="Fermer la modale"
            >
              <div className="i-ph:x-bold w-6 h-6" />
            </button>
          </div>

          {currentStep === 'welcome' ? (
            <div className="space-y-8">
              <div className="text-bolt-elements-textSecondary">
                <p className="mb-6 text-lg leading-relaxed">
                  NeuroCode est la plateforme de développement full-stack nouvelle génération, 
                  combinant intelligence artificielle et outils modernes pour booster votre productivité.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { 
                      icon: 'ph:rocket-launch', 
                      title: 'Développement accéléré',
                      text: 'Générez du code intelligent en quelques secondes' 
                    },
                    { 
                      icon: 'ph:brain', 
                      title: 'IA intégrée',
                      text: 'Assistance intelligente pour chaque étape du développement' 
                    },
                    { 
                      icon: 'ph:stack', 
                      title: 'Architecture modulaire',
                      text: 'Créez des applications avec des composants réutilisables' 
                    },
                    { 
                      icon: 'ph:shield-check', 
                      title: 'Sécurité renforcée',
                      text: 'Protocoles de sécurité avancés pour vos projets' 
                    },
                  ].map((item, index) => (
                    <div key={index} className="p-4 bg-bolt-elements-background-depth-2 rounded-xl border-2 border-bolt-elements-border/20 hover:border-green-400/30 transition-all duration-200">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`i-${item.icon} w-6 h-6 text-green-400`} />
                          <h3 className="font-semibold text-bolt-elements-textPrimary">{item.title}</h3>
                        </div>
                        <p className="text-sm">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center gap-4 mt-8">
                <button
                  onClick={handleStartProfileSetup}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all duration-200 font-semibold flex items-center gap-2"
                >
                  <div className="i-ph:user-circle-bold w-5 h-5" />
                  Configurer mon profil
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-3 rounded-xl text-white bg-bolt-elements-background-depth-2 border-2 border-bolt-elements-border/20 hover:border-green-400/30 hover:bg-bolt-elements-background-depth-3 transition-all duration-200 font-medium"
                >
                  Explorer sans profil
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleProfileSubmit} className="space-y-8">
              <div className="flex flex-col items-center space-y-4">
                <div className="relative group">
                  <div className="w-28 h-28 rounded-full bg-bolt-elements-background-depth-2 border-2 border-bolt-elements-border/20 overflow-hidden ring-4 ring-bolt-elements-background-depth-3/30 hover:ring-green-400/20 transition-all duration-300">
                    {avatarPreview || profile.avatar ? (
                      <img
                        src={avatarPreview || profile.avatar}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="i-ph:user-circle w-full h-full text-bolt-elements-textSecondary" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-2 bg-bolt-elements-background-depth-3 rounded-full border-2 border-bolt-elements-border/20 hover:bg-bolt-elements-background-depth-4 hover:border-green-400/30 transition-all duration-200 shadow-md"
                    aria-label="Changer la photo de profil"
                  >
                    <div className="i-ph:camera-bold w-5 h-5 text-bolt-elements-textPrimary" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
                <p className="text-sm text-bolt-elements-textSecondary text-center">
                  Cliquez sur l'icône pour changer votre photo de profil (Max 5MB, JPEG, PNG, GIF, WEBP)
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label htmlFor="username" className="block text-sm font-semibold text-white">
                    Nom d'utilisateur
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    id="username"
                    name="username"
                    defaultValue={profile.username}
                    required
                    className={`w-full text-white px-4 py-3 rounded-xl bg-bolt-elements-background-depth-2 border-2 ${
                      usernameError 
                        ? 'border-red-500/80 focus:ring-red-500/30' 
                        : 'border-bolt-elements-border/20 focus:ring-green-500/30'
                    } focus:outline-none focus:ring-4 transition-all duration-200`}
                  />
                  {usernameError && <p className="text-red-500 text-sm mt-1">{usernameError}</p>}
                </div>
                <div className="space-y-3">
                  <label htmlFor="bio" className="block text-sm font-semibold text-white">
                    Bio
                  </label>
                  <textarea
                    id="bio"
                    name="bio"
                    defaultValue={profile.bio}
                    className="w-full text-white px-4 py-3 rounded-xl bg-bolt-elements-background-depth-2 border-2 border-bolt-elements-border/20 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button
                  type="button"
                  onClick={handleStartWithoutProfile}
                  className="px-6 py-3 rounded-xl bg-transparent border-2 border-bolt-elements-border/20 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:border-green-400/30 transition-all duration-200 font-medium"
                >
                  Commencer sans profil
                </button>
                <button
                  type="submit"
                  onClick={handleClose}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all duration-200 font-semibold shadow-lg hover:shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="i-svg-spinners:3-dots-scale w-5 h-5 mr-2" />
                      <span>Enregistrement...</span>
                    </div>
                  ) : (
                    "Enregistrer et continuer"
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
