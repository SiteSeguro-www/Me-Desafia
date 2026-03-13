import React, { useState, useEffect } from 'react';
import { User, Task, Challenge, RankingUser, Post, CompletedVideo } from './types';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
  handleFirestoreError,
  OperationType
} from './firebase';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  User as UserIcon, 
  Plus, 
  DollarSign, 
  Users, 
  Video, 
  VideoOff, 
  Heart, 
  MessageSquare,
  CheckCircle2,
  Clock,
  Zap,
  ShieldCheck,
  XCircle,
  TrendingUp,
  LayoutGrid,
  List,
  Eye,
  LogOut,
  LogIn,
  Play,
  Settings,
  Radio,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

function CheckoutForm({ amount, targetType, targetId, username, onSuccess, onCancel }: { 
  amount: number, 
  targetType: 'task' | 'challenge', 
  targetId: string, 
  username: string,
  onSuccess: () => void,
  onCancel: () => void
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, targetType, targetId, username }),
      });
      const { clientSecret, error: backendError } = await response.json();

      if (backendError) throw new Error(backendError);

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
        },
      });

      if (result.error) {
        setError(result.error.message || "Payment failed");
      } else if (result.paymentIntent.status === 'succeeded') {
        await fetch('/api/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: result.paymentIntent.id }),
        });
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-zinc-800 p-4 rounded-xl border border-zinc-700">
        <CardElement options={{
          style: {
            base: {
              fontSize: '16px',
              color: '#fff',
              '::placeholder': { color: '#71717a' },
            },
          },
        }} />
      </div>
      {error && <div className="text-red-500 text-xs font-medium">{error}</div>}
      <div className="flex gap-4">
        <button 
          type="button"
          onClick={onCancel}
          className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold"
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          disabled={!stripe || processing}
          className="flex-1 bg-emerald-500 text-zinc-950 py-3 rounded-xl font-black uppercase tracking-widest text-xs disabled:opacity-50"
        >
          {processing ? 'Processando...' : `Pagar R$ ${amount.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <Elements stripe={stripePromise}>
        <App />
      </Elements>
    </ErrorBoundary>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [completedVideos, setCompletedVideos] = useState<CompletedVideo[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'tasks' | 'challenges' | 'ranking' | 'videos'>('feed');
  const [ranking, setRanking] = useState<RankingUser[]>([]);
  const [rankingSort, setRankingSort] = useState<'challenges_completed' | 'total_earned' | 'follower_count'>('challenges_completed');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState<{amount: number, targetType: 'task' | 'challenge', targetId: string} | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState<{id: string, title: string, type: 'task' | 'challenge'} | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', price: '' });
  const [newChallenge, setNewChallenge] = useState({ title: '', description: '', price: '' });
  const [newPost, setNewPost] = useState({ content: '', image_url: '' });
  const [profileForm, setProfileForm] = useState({ display_name: '', bio: '', pix_key: '', pix_type: 'cpf' as 'cpf' | 'email' | 'phone' | 'random' });
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawStatus, setWithdrawStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [completionData, setCompletionData] = useState({ video_url: '', thumbnail_url: '' });
  const [completionMethod, setCompletionMethod] = useState<'video' | 'live'>('video');
  const [showLivePanel, setShowLivePanel] = useState(false);
  const [viewMode, setViewMode] = useState<'creator' | 'follower'>('creator');
  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (showLivePanel) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.error("Error accessing camera:", err));
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [showLivePanel]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser(userDoc.data() as User);
          } else {
            const newUser: User = {
              uid: firebaseUser.uid,
              display_name: firebaseUser.displayName || 'Usuário',
              username: firebaseUser.email?.split('@')[0] || 'user',
              email: firebaseUser.email || '',
              bio: 'Novo no MeDesafia!',
              avatar_url: firebaseUser.photoURL || `https://picsum.photos/seed/${firebaseUser.uid}/200`,
              role: 'follower',
              points: 0,
              balance: 0,
              followers: 0,
              completedTasks: 0,
              createdAt: serverTimestamp()
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
            setUser(newUser);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listen to tasks
    const tasksPath = 'tasks';
    const qTasks = query(collection(db, tasksPath), orderBy('created_at', 'desc'));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, tasksPath);
    });

    // Listen to challenges
    const challengesPath = 'challenges';
    const qChallenges = query(collection(db, challengesPath), orderBy('created_at', 'desc'));
    const unsubChallenges = onSnapshot(qChallenges, (snapshot) => {
      const challengesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge));
      setChallenges(challengesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, challengesPath);
    });

    // Listen to ranking (simplified for now)
    const usersPath = 'users';
    const qRanking = query(collection(db, usersPath), orderBy('points', 'desc'));
    const unsubRanking = onSnapshot(qRanking, (snapshot) => {
      const rankingData = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          uid: doc.id,
          username: d.username,
          display_name: d.display_name,
          avatar_url: d.avatar_url,
          challenges_completed: d.completedTasks || 0,
          total_earned: d.balance || 0,
          follower_count: d.followers || 0
        } as RankingUser;
      });
      setRanking(rankingData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, usersPath);
    });

    // Listen to posts
    const postsPath = 'posts';
    const qPosts = query(collection(db, postsPath), orderBy('created_at', 'desc'));
    const unsubPosts = onSnapshot(qPosts, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      setPosts(postsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, postsPath);
    });

    // Listen to completed videos
    const videosPath = 'completed_videos';
    const qVideos = query(collection(db, videosPath), orderBy('created_at', 'desc'));
    const unsubVideos = onSnapshot(qVideos, (snapshot) => {
      const videosData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CompletedVideo));
      setCompletedVideos(videosData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, videosPath);
    });

    return () => {
      unsubTasks();
      unsubChallenges();
      unsubRanking();
      unsubPosts();
      unsubVideos();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const path = 'tasks';
    try {
      await addDoc(collection(db, path), {
        creatorId: user.uid,
        title: newTask.title,
        description: newTask.description,
        price: parseFloat(newTask.price),
        points: Math.floor(parseFloat(newTask.price) * 10),
        status: 'pending',
        created_at: serverTimestamp()
      });
      setShowTaskModal(false);
      setNewTask({ title: '', description: '', price: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleSendChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const path = 'challenges';
    try {
      await addDoc(collection(db, path), {
        creatorId: 'global', // Simplified for demo
        followerId: user.uid,
        follower_username: user.username,
        title: newChallenge.title,
        description: newChallenge.description,
        price: parseFloat(newChallenge.price),
        total_raised: 0,
        status: 'pending',
        created_at: serverTimestamp()
      });
      setShowChallengeModal(false);
      setNewChallenge({ title: '', description: '', price: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleChallengeAction = async (challengeId: string, status: 'accepted' | 'refused') => {
    const path = `challenges/${challengeId}`;
    try {
      await updateDoc(doc(db, 'challenges', challengeId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handlePayment = async (taskId: string, price: number) => {
    setShowPaymentModal({ amount: price, targetType: 'task', targetId: taskId });
  };

  const handlePayChallenge = async (challengeId: string, amount: number) => {
    setShowPaymentModal({ amount: amount, targetType: 'challenge', targetId: challengeId });
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amount = parseFloat(withdrawAmount);
    const fee = 2.00; // Fixed withdrawal fee
    const totalDeduction = amount + fee;

    if (amount <= 0) {
      setWithdrawStatus({ type: 'error', message: "Valor inválido." });
      return;
    }

    if (user.balance < totalDeduction) {
      setWithdrawStatus({ type: 'error', message: "Saldo insuficiente. Lembre-se da taxa de saque de R$ 2,00." });
      return;
    }

    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        balance: increment(-totalDeduction)
      });
      setWithdrawStatus({ type: 'success', message: `Saque de R$ ${amount.toFixed(2)} solicitado com sucesso! Taxa de R$ 2,00 aplicada.` });
      setWithdrawAmount('');
      setTimeout(() => {
        setShowWithdrawModal(false);
        setWithdrawStatus(null);
      }, 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      setWithdrawStatus({ type: 'error', message: "Erro ao processar saque. Tente novamente." });
    }
  };

  const handleContribute = async (challengeId: string, amount: number) => {
    const path = `challenges/${challengeId}`;
    try {
      await updateDoc(doc(db, 'challenges', challengeId), {
        total_raised: increment(amount)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const path = 'posts';
    try {
      await addDoc(collection(db, path), {
        userId: user.uid,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        content: newPost.content,
        image_url: newPost.image_url || null,
        likes: 0,
        created_at: serverTimestamp()
      });
      setShowPostModal(false);
      setNewPost({ content: '', image_url: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  useEffect(() => {
    if (user && showProfileModal) {
      setProfileForm({
        display_name: user.display_name,
        bio: user.bio,
        pix_key: user.pix_key || '',
        pix_type: user.pix_type || 'cpf'
      });
    }
  }, [user, showProfileModal]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        display_name: profileForm.display_name,
        bio: profileForm.bio,
        pix_key: profileForm.pix_key,
        pix_type: profileForm.pix_type
      });
      setShowProfileModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleCompleteViaLive = async () => {
    if (!user || !showCompleteModal) return;
    
    const { id, title, type } = showCompleteModal;
    const collectionName = type === 'task' ? 'tasks' : 'challenges';
    const path = `${collectionName}/${id}`;
    const videosPath = 'completed_videos';

    try {
      // 1. Update status to completed in Firestore
      await updateDoc(doc(db, collectionName, id), { 
        status: 'completed',
        video_url: 'LIVE_STREAM_COMPLETED'
      });

      // 2. Call backend to process payout
      await fetch(`/api/${collectionName}/${id}/complete`, { method: 'POST' });

      await addDoc(collection(db, videosPath), {
        userId: user.uid,
        challengeId: id,
        title: title,
        video_url: 'LIVE_STREAM_COMPLETED',
        thumbnail_url: `https://picsum.photos/seed/${id}/400/225`,
        created_at: serverTimestamp()
      });

      await updateDoc(doc(db, 'users', user.uid), {
        completedTasks: increment(1),
        points: increment(100)
      });

      setShowLivePanel(false);
      setShowCompleteModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleLikePost = async (postId: string) => {
    const path = `posts/${postId}`;
    try {
      await updateDoc(doc(db, 'posts', postId), {
        likes: increment(1)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleCompleteChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !showCompleteModal) return;
    
    const { id, title, type } = showCompleteModal;
    const collectionName = type === 'task' ? 'tasks' : 'challenges';
    const path = `${collectionName}/${id}`;
    const videosPath = 'completed_videos';

    try {
      // 1. Update status to completed in Firestore
      await updateDoc(doc(db, collectionName, id), { 
        status: 'completed',
        video_url: completionData.video_url
      });

      // 2. Call backend to process payout
      await fetch(`/api/${collectionName}/${id}/complete`, { method: 'POST' });

      // 3. Add to completed videos collection
      await addDoc(collection(db, videosPath), {
        userId: user.uid,
        challengeId: id,
        title: title,
        video_url: completionData.video_url,
        thumbnail_url: completionData.thumbnail_url || `https://picsum.photos/seed/${id}/400/225`,
        created_at: serverTimestamp()
      });

      // 3. Update user stats
      await updateDoc(doc(db, 'users', user.uid), {
        completedTasks: increment(1),
        points: increment(100)
      });

      setShowCompleteModal(null);
      setCompletionData({ video_url: '', thumbnail_url: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-zinc-950 text-white font-mono">INITIALIZING_SYSTEM...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8 max-w-md"
        >
          <h1 className="text-6xl font-black tracking-tighter italic flex items-center justify-center gap-4">
            <Zap className="text-emerald-400 fill-emerald-400" size={60} />
            MEDESAFIA
          </h1>
          <p className="text-zinc-400 text-lg font-medium">A plataforma onde desafios viram realidade. Conecte-se para começar.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-zinc-950 font-black py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/10"
          >
            <LogIn size={20} />
            ENTRAR COM GOOGLE
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2 italic">
              <Zap className="text-emerald-400 fill-emerald-400" size={28} />
              MEDESAFIA
            </h1>
            <nav className="hidden md:flex items-center gap-6">
              <button onClick={() => setActiveTab('feed')} className={`text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'feed' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Feed</button>
              <button onClick={() => setActiveTab('tasks')} className={`text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'tasks' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Minhas Missões</button>
              <button onClick={() => setActiveTab('challenges')} className={`text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'challenges' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Duvido Você?</button>
              <button onClick={() => setActiveTab('videos')} className={`text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'videos' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Vídeos</button>
              <button onClick={() => setActiveTab('ranking')} className={`text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'ranking' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Ranking</button>
            </nav>
          </div>
          
            <div className="flex items-center gap-4">
              {viewMode === 'follower' && (
                <button 
                  onClick={() => setShowChallengeModal(true)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(16,185,129,0.5)] animate-bounce"
                >
                  DESAFIE AGORA
                </button>
              )}
              <div className="hidden sm:flex bg-zinc-900 rounded-full p-1 border border-zinc-800">
                <button 
                  onClick={() => setViewMode('creator')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'creator' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-400'}`}
                >
                  Criador
                </button>
                <button 
                  onClick={() => setViewMode('follower')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'follower' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-400'}`}
                >
                  Seguidor
                </button>
              </div>
              <button 
                onClick={() => setShowProfileModal(true)}
                className="p-2 text-zinc-500 hover:text-emerald-400 transition-colors"
                title="Configurações de Perfil"
              >
                <Settings size={20} />
              </button>
              <button 
                onClick={handleLogout}
                className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                title="Sair"
              >
                <LogOut size={20} />
              </button>
            </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 pb-32">
        {/* Bento Grid Stats & Profile */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Profile Card */}
          <div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 p-8 rounded-[2.5rem] flex flex-col sm:flex-row items-center sm:items-start gap-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] -mr-32 -mt-32 group-hover:bg-emerald-500/10 transition-colors" />
            <div className="relative">
              <div className="w-32 h-32 rounded-[2rem] overflow-hidden border-4 border-zinc-800 shadow-2xl rotate-3 group-hover:rotate-0 transition-transform duration-500">
                <img 
                  src={user.avatar_url} 
                  alt={user.display_name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {isLive && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-500 text-[10px] font-black px-3 py-1 rounded-full border-4 border-zinc-950 shadow-lg">
                  LIVE
                </div>
              )}
            </div>
              <div className="flex-1 text-center sm:text-left z-10">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
                  <h2 className="text-3xl font-black tracking-tight">{user.display_name}</h2>
                  <ShieldCheck className="text-emerald-400" size={20} />
                </div>
                <p className="text-zinc-500 font-mono text-sm mb-4 tracking-tight">@{user.username}</p>
                <p className="text-zinc-300 leading-relaxed text-lg font-medium max-w-md">Pague e veja se eu consigo cumprir.</p>
                
                <div className="mt-6 flex flex-wrap gap-3 justify-center sm:justify-start">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Saldo Disponível</p>
                    <p className="text-xl font-black text-white">R$ {user.balance.toFixed(2)}</p>
                  </div>
                  <button 
                    onClick={() => setShowWithdrawModal(true)}
                    className="bg-white text-zinc-950 px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all flex items-center gap-2"
                  >
                    <DollarSign size={16} />
                    Sacar
                  </button>
                </div>
              </div>
          </div>

          {/* Stats Column */}
          <div className="flex flex-col gap-6">
            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-[2rem] flex items-center justify-between group">
              <div>
                <p className="text-zinc-500 text-xs font-black uppercase tracking-widest mb-1">Seguidores</p>
                <p className="text-3xl font-black tabular-nums">{user.followers}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Users size={24} />
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-[2rem] flex items-center justify-between group">
              <div>
                <p className="text-zinc-500 text-xs font-black uppercase tracking-widest mb-1">Ganhos</p>
                <p className="text-3xl font-black tabular-nums">R$ {user.balance.toFixed(0)}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <TrendingUp size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation (Mobile Only) */}
        <div className="flex md:hidden bg-zinc-900/50 p-2 rounded-2xl border border-zinc-800 mb-8 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('feed')} className={`flex-shrink-0 px-6 py-3 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'feed' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>FEED</button>
          <button onClick={() => setActiveTab('tasks')} className={`flex-shrink-0 px-6 py-3 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'tasks' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>MISSÕES</button>
          <button onClick={() => setActiveTab('challenges')} className={`flex-shrink-0 px-6 py-3 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'challenges' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>DUVIDO?</button>
          <button onClick={() => setActiveTab('videos')} className={`flex-shrink-0 px-6 py-3 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'videos' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>VÍDEOS</button>
          <button onClick={() => setActiveTab('ranking')} className={`flex-shrink-0 px-6 py-3 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'ranking' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>RANKING</button>
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {activeTab === 'feed' && (
            <motion.div 
              key="feed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <Eye className="text-emerald-400" size={20} />
                  FEED DA COMUNIDADE
                </h3>
                <button 
                  onClick={() => setShowPostModal(true)}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-zinc-800 transition-all"
                >
                  NOVA POSTAGEM
                </button>
              </div>

              {/* Live Stream Section (kept as part of feed) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-zinc-500 uppercase tracking-widest">Transmissão ao Vivo</h4>
                  {isLive && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                      <span className="text-xs font-black text-red-500 uppercase tracking-widest">1.4k assistindo</span>
                    </div>
                  )}
                </div>
                
                {isLive ? (
                  <div className="aspect-video bg-zinc-900 rounded-[3rem] overflow-hidden relative border-4 border-zinc-800 group shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative">
                        <Video size={80} className="text-zinc-800 group-hover:text-emerald-500/20 transition-colors duration-500" />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 bg-emerald-500/5 blur-3xl"
                        />
                      </div>
                    </div>
                    
                    <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between">
                      <div className="space-y-4 max-w-xs">
                        <div className="flex -space-x-3">
                          {[1,2,3,4].map(i => (
                            <img key={`avatar-${i}`} src={`https://picsum.photos/seed/user${i}/40`} className="w-10 h-10 rounded-full border-2 border-zinc-900" referrerPolicy="no-referrer" />
                          ))}
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center text-[10px] font-bold">+1.4k</div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-xl p-4 rounded-2xl border border-white/10">
                          <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-1">Último Desafio Pago</p>
                          <p className="text-sm font-bold">"Fazer 20 flexões agora!" - R$ 50,00</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3">
                        <button className="p-4 bg-white/10 backdrop-blur-xl rounded-2xl hover:bg-emerald-500 hover:text-zinc-950 transition-all group">
                          <Heart size={24} className="group-active:scale-150 transition-transform" />
                        </button>
                        <button className="p-4 bg-white/10 backdrop-blur-xl rounded-2xl hover:bg-emerald-500 hover:text-zinc-950 transition-all">
                          <MessageSquare size={24} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center border-4 border-dashed border-zinc-900 rounded-[2rem] bg-zinc-900/20">
                    <VideoOff size={48} className="mx-auto mb-4 text-zinc-800" />
                    <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">Nenhuma live ativa no momento</p>
                  </div>
                )}
              </div>

              {/* Posts Section */}
              <div className="space-y-6">
                <h4 className="text-sm font-black text-zinc-500 uppercase tracking-widest">Postagens Recentes</h4>
                {posts.length === 0 ? (
                  <div className="py-20 text-center bg-zinc-900/30 rounded-[2rem] border border-zinc-800">
                    <p className="text-zinc-500 font-bold uppercase tracking-widest">Nenhuma postagem ainda</p>
                  </div>
                ) : (
                  posts.map(post => (
                    <motion.div 
                      key={post.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-zinc-900/50 border border-zinc-800 rounded-[2.5rem] overflow-hidden group hover:border-emerald-500/30 transition-all"
                    >
                      <div className="p-8">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-zinc-800">
                            <img src={post.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <div>
                            <h5 className="font-black text-white">{post.display_name}</h5>
                            <p className="text-zinc-500 font-mono text-xs">@{post.username}</p>
                          </div>
                          <div className="ml-auto text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                            {post.created_at ? new Date(post.created_at.seconds * 1000).toLocaleDateString() : 'Agora'}
                          </div>
                        </div>
                        <p className="text-zinc-200 text-lg font-medium leading-relaxed mb-6">
                          {post.content}
                        </p>
                        {post.image_url && (
                          <div className="rounded-3xl overflow-hidden border border-zinc-800 mb-6">
                            <img src={post.image_url} className="w-full h-auto" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        <div className="flex items-center gap-6">
                          <button 
                            onClick={() => handleLikePost(post.id)}
                            className="flex items-center gap-2 text-zinc-500 hover:text-emerald-400 transition-colors group/like"
                          >
                            <Heart size={20} className="group-active/like:scale-150 transition-transform" />
                            <span className="text-sm font-black tabular-nums">{post.likes}</span>
                          </button>
                          <button className="flex items-center gap-2 text-zinc-500 hover:text-emerald-400 transition-colors">
                            <MessageSquare size={20} />
                            <span className="text-sm font-black tabular-nums">0</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'tasks' && (
            <motion.div 
              key="tasks"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-black tracking-tight">Minhas Missões</h3>
                {viewMode === 'creator' && (
                  <button 
                    onClick={() => setShowTaskModal(true)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    <Plus size={18} />
                    Nova Missão
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                {tasks.length === 0 ? (
                  <div className="py-20 text-center bg-zinc-900/30 rounded-[2rem] border border-zinc-800">
                    <p className="text-zinc-500 font-bold uppercase tracking-widest">Nenhum desafio ativo</p>
                  </div>
                ) : (
                  tasks.map(task => (
                    <div key={task.id} className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-[2.5rem] flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 group hover:border-emerald-500/50 transition-all">
                      <div className="flex-1 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-3 mb-3">
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                            task.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 
                            task.status === 'completed' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' : 
                            'bg-zinc-800 text-zinc-500 border border-zinc-700'
                          }`}>
                            {task.status === 'pending' ? 'Pendente' : task.status === 'paid' ? 'Pago' : 'Concluído'}
                          </span>
                          <span className="text-xs text-zinc-600 font-mono flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(task.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <h4 className="text-2xl font-black mb-2 group-hover:text-emerald-400 transition-colors">{task.title}</h4>
                        <p className="text-zinc-400 font-medium leading-relaxed">{task.description}</p>
                      </div>
                      <div className="text-center sm:text-right flex flex-col items-center sm:items-end gap-4">
                        <div className="text-3xl font-black text-white tabular-nums">R$ {task.price.toFixed(2)}</div>
                        {viewMode === 'follower' && task.status === 'pending' && (
                          <button 
                            onClick={() => handlePayment(task.id, task.price)}
                            className="bg-white text-zinc-950 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all"
                          >
                            Pagar Agora
                          </button>
                        )}
                        {viewMode === 'creator' && task.status === 'paid' && (
                          <button 
                            onClick={() => setShowCompleteModal({ id: task.id, title: task.title, type: 'task' })}
                            className="bg-emerald-500 text-zinc-950 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all flex items-center gap-2"
                          >
                            <CheckCircle2 size={18} />
                            Concluir
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'challenges' && (
            <motion.div 
              key="challenges"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-black tracking-tight">Duvido Você? (Leilão)</h3>
                {viewMode === 'follower' && (
                  <button 
                    onClick={() => setShowChallengeModal(true)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    <Plus size={18} />
                    Lançar Desafio
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                {challenges.length === 0 ? (
                  <div className="py-20 text-center bg-zinc-900/30 rounded-[2rem] border border-zinc-800">
                    <p className="text-zinc-500 font-bold uppercase tracking-widest">Nenhum desafio recebido</p>
                  </div>
                ) : (
                  challenges.map(challenge => (
                    <div key={challenge.id} className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-[2.5rem] flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 group hover:border-emerald-500/50 transition-all">
                      <div className="flex-1 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-3 mb-3">
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                            challenge.status === 'accepted' ? 'bg-blue-500/20 text-blue-400' : 
                            challenge.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 
                            challenge.status === 'refused' ? 'bg-red-500/20 text-red-400' : 
                            'bg-zinc-800 text-zinc-500'
                          }`}>
                            {challenge.status === 'pending' ? 'Novo Desafio' : 
                             challenge.status === 'accepted' ? 'Aceito' : 
                             challenge.status === 'paid' ? 'Pago' : 
                             'Recusado'}
                          </span>
                          <span className="text-xs text-zinc-600 font-bold">por @{challenge.follower_username}</span>
                        </div>
                        <h4 className="text-2xl font-black mb-2">{challenge.title}</h4>
                        <p className="text-zinc-400 font-medium mb-4">{challenge.description}</p>
                        
                        <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest text-zinc-500">
                          <div className="flex items-center gap-1">
                            <DollarSign size={14} className="text-emerald-400" />
                            Valor Base: R$ {challenge.price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="text-center sm:text-right flex flex-col items-center sm:items-end gap-4">
                        <div className="space-y-1 bg-emerald-500/5 p-4 rounded-3xl border border-emerald-500/10">
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Valor do Leilão</p>
                          <div className="text-4xl font-black text-emerald-400 tabular-nums">R$ {(challenge.price + (challenge.total_raised || 0)).toFixed(2)}</div>
                        </div>
                        
                        {viewMode === 'follower' && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleContribute(challenge.id, 10)}
                              className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              + R$ 10
                            </button>
                            <button 
                              onClick={() => handleContribute(challenge.id, 50)}
                              className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              + R$ 50
                            </button>
                          </div>
                        )}

                        {viewMode === 'creator' && challenge.status === 'pending' && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleChallengeAction(challenge.id, 'refused')}
                              className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                            >
                              <XCircle size={20} />
                            </button>
                            <button 
                              onClick={() => handleChallengeAction(challenge.id, 'accepted')}
                              className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-zinc-950 transition-all"
                            >
                              <CheckCircle2 size={20} />
                            </button>
                          </div>
                        )}
                        
                        {viewMode === 'follower' && challenge.status === 'accepted' && (
                          <button 
                            onClick={() => handlePayChallenge(challenge.id, challenge.price + (challenge.total_raised || 0))}
                            className="bg-white text-zinc-950 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all"
                          >
                            Pagar Agora
                          </button>
                        )}

                        {viewMode === 'creator' && challenge.status === 'paid' && (
                          <button 
                            onClick={() => setShowCompleteModal({ id: challenge.id, title: challenge.title, type: 'challenge' })}
                            className="bg-emerald-500 text-zinc-950 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all flex items-center gap-2"
                          >
                            <CheckCircle2 size={18} />
                            Concluir
                          </button>
                        )}
                        
                        {challenge.status === 'paid' && viewMode === 'follower' && (
                          <div className="text-emerald-400 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 size={16} />
                            Pago
                          </div>
                        )}
                        
                        {challenge.status === 'accepted' && viewMode === 'follower' && (
                          <div className="text-blue-400 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 size={16} />
                            Aguardando Pagamento
                          </div>
                        )}
                        {challenge.status === 'refused' && (
                          <div className="text-red-400 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <XCircle size={16} />
                            Recusado
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'videos' && (
            <motion.div 
              key="videos"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="space-y-1">
                <h3 className="text-4xl font-black tracking-tighter italic text-white uppercase">VÍDEOS DOS DESAFIOS</h3>
                <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Provas reais de que eu cumpro o que prometo</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {completedVideos.length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-zinc-900/30 rounded-[2rem] border border-zinc-800">
                    <p className="text-zinc-500 font-bold uppercase tracking-widest">Nenhum vídeo ainda</p>
                  </div>
                ) : (
                  completedVideos.map(video => (
                    <motion.div 
                      key={video.id}
                      className="bg-zinc-900/50 border border-zinc-800 rounded-[2.5rem] overflow-hidden group hover:border-emerald-500/30 transition-all"
                    >
                      <div className="aspect-video relative overflow-hidden">
                        <img 
                          src={video.thumbnail_url} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-zinc-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-zinc-950 shadow-2xl">
                            <Play size={32} fill="currentColor" />
                          </div>
                        </div>
                        <div className="absolute bottom-4 left-4 right-4">
                          <span className="bg-zinc-950/80 backdrop-blur-md text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-white/10">
                            {video.created_at ? new Date(video.created_at.seconds * 1000).toLocaleDateString() : 'Recent'}
                          </span>
                        </div>
                      </div>
                      <div className="p-6">
                        <h4 className="text-lg font-black text-white mb-2 line-clamp-1">{video.title}</h4>
                        <button className="text-emerald-400 text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:text-emerald-300 transition-colors">
                          Assistir Prova
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'ranking' && (
            <motion.div 
              key="ranking"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
                <div className="space-y-1 text-center sm:text-left">
                  <h3 className="text-4xl font-black tracking-tighter italic text-white">HALL DA FAMA</h3>
                  <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Os maiores criadores da plataforma</p>
                </div>
                <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800 shadow-2xl">
                  <button 
                    onClick={() => setRankingSort('challenges_completed')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rankingSort === 'challenges_completed' ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Missões
                  </button>
                  <button 
                    onClick={() => setRankingSort('total_earned')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rankingSort === 'total_earned' ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Ganhos
                  </button>
                  <button 
                    onClick={() => setRankingSort('follower_count')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rankingSort === 'follower_count' ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Seguidores
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {ranking.map((rankUser, index) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    key={rankUser.uid} 
                    className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-[2rem] flex items-center gap-6 group hover:border-emerald-500/30 transition-all"
                  >
                    <div className="w-12 h-12 flex items-center justify-center text-2xl font-black italic text-zinc-700 group-hover:text-emerald-400 transition-colors">
                      #{index + 1}
                    </div>
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-zinc-800">
                      <img src={rankUser.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-black tracking-tight">{rankUser.display_name}</h4>
                      <p className="text-zinc-500 font-mono text-xs">@{rankUser.username}</p>
                    </div>
                    <div className="text-right">
                      {rankingSort === 'challenges_completed' && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Missões</p>
                          <p className="text-2xl font-black text-white">{rankUser.challenges_completed}</p>
                        </div>
                      )}
                      {rankingSort === 'total_earned' && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ganhos</p>
                          <p className="text-2xl font-black text-emerald-400">R$ {rankUser.total_earned.toFixed(0)}</p>
                        </div>
                      )}
                      {rankingSort === 'follower_count' && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Seguidores</p>
                          <p className="text-2xl font-black text-white">{rankUser.follower_count}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Task Modal */}
      <AnimatePresence>
        {showTaskModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTaskModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-[3rem] p-10 shadow-2xl"
            >
              <h3 className="text-3xl font-black mb-8 tracking-tight">CRIAR MISSÃO</h3>
              <form onSubmit={handleCreateTask} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">O que você vai fazer?</label>
                  <input 
                    required
                    type="text" 
                    value={newTask.title}
                    onChange={e => setNewTask({...newTask, title: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold"
                    placeholder="Ex: Jogar de olhos vendados"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Detalhes</label>
                  <textarea 
                    required
                    value={newTask.description}
                    onChange={e => setNewTask({...newTask, description: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all h-32 resize-none font-medium"
                    placeholder="Descreva a missão..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Valor Mínimo (R$)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={newTask.price}
                    onChange={e => setNewTask({...newTask, price: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-black text-xl"
                    placeholder="0.00"
                  />
                </div>
                <div className="pt-6 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowTaskModal(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20"
                  >
                    Publicar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Challenge Modal */}
      <AnimatePresence>
        {showChallengeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChallengeModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-[3rem] p-10 shadow-2xl"
            >
              <h3 className="text-3xl font-black mb-8 tracking-tight">DESAFIAR CRIADOR</h3>
              <form onSubmit={handleSendChallenge} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">O Desafio</label>
                  <input 
                    required
                    type="text" 
                    value={newChallenge.title}
                    onChange={e => setNewChallenge({...newChallenge, title: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold"
                    placeholder="Ex: Comer uma pimenta ao vivo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Instruções</label>
                  <textarea 
                    required
                    value={newChallenge.description}
                    onChange={e => setNewChallenge({...newChallenge, description: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all h-32 resize-none font-medium"
                    placeholder="Como o criador deve fazer?"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Sua Oferta (R$)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={newChallenge.price}
                    onChange={e => setNewChallenge({...newChallenge, price: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-black text-xl"
                    placeholder="0.00"
                  />
                </div>
                <div className="pt-6 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowChallengeModal(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20"
                  >
                    Enviar Desafio
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Post Modal */}
      <AnimatePresence>
        {showPostModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPostModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-[3rem] p-10 shadow-2xl"
            >
              <h3 className="text-3xl font-black mb-8 tracking-tight">NOVA POSTAGEM</h3>
              <form onSubmit={handleCreatePost} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">O que está acontecendo?</label>
                  <textarea 
                    required
                    value={newPost.content}
                    onChange={e => setNewPost({...newPost, content: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all h-40 resize-none font-medium"
                    placeholder="Compartilhe um desafio ou novidade..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">URL da Imagem (Opcional)</label>
                  <input 
                    type="text" 
                    value={newPost.image_url}
                    onChange={e => setNewPost({...newPost, image_url: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold"
                    placeholder="https://exemplo.com/imagem.jpg"
                  />
                </div>
                <div className="pt-6 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowPostModal(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20"
                  >
                    Postar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Editor Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-[3rem] p-10 shadow-2xl"
            >
              <h3 className="text-3xl font-black mb-2 tracking-tight">EDITAR PERFIL</h3>
              <p className="text-zinc-500 text-sm font-medium mb-8">Atualize suas informações e dados de recebimento.</p>
              
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Nome de Exibição</label>
                  <input 
                    required
                    type="text" 
                    value={profileForm.display_name}
                    onChange={e => setProfileForm({...profileForm, display_name: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Bio</label>
                  <textarea 
                    value={profileForm.bio}
                    onChange={e => setProfileForm({...profileForm, bio: e.target.value})}
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold resize-none h-24"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Tipo de PIX</label>
                    <select 
                      value={profileForm.pix_type}
                      onChange={e => setProfileForm({...profileForm, pix_type: e.target.value as any})}
                      className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold appearance-none"
                    >
                      <option value="cpf">CPF</option>
                      <option value="email">E-mail</option>
                      <option value="phone">Telefone</option>
                      <option value="random">Chave Aleatória</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Chave PIX</label>
                    <input 
                      type="text" 
                      value={profileForm.pix_key}
                      onChange={e => setProfileForm({...profileForm, pix_key: e.target.value})}
                      className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold"
                      placeholder="Sua chave aqui"
                    />
                  </div>
                </div>

                <div className="pt-6 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdrawModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWithdrawModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[3rem] p-10 shadow-2xl"
            >
              <h3 className="text-3xl font-black mb-2 tracking-tight">SOLICITAR SAQUE</h3>
              <p className="text-zinc-500 text-sm font-medium mb-8">O valor será enviado para sua chave PIX configurada.</p>
              
              <div className="bg-zinc-950 p-6 rounded-3xl border border-zinc-800 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-zinc-500 text-xs font-black uppercase tracking-widest">Saldo Atual</span>
                  <span className="text-xl font-black text-white">R$ {user.balance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-400">
                  <span className="text-xs font-black uppercase tracking-widest">Chave PIX</span>
                  <span className="text-sm font-bold">{user.pix_key || 'Não configurada'}</span>
                </div>
              </div>

              <form onSubmit={handleWithdraw} className="space-y-6">
                {withdrawStatus && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-2xl text-xs font-bold uppercase tracking-widest text-center ${
                      withdrawStatus.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/20 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {withdrawStatus.message}
                  </motion.div>
                )}
                <div>
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Valor do Saque (R$)</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold text-2xl"
                  />
                  <p className="mt-3 text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                    Taxa de saque: <span className="text-white">R$ 2,00</span>
                  </p>
                </div>

                <div className="pt-6 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowWithdrawModal(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={!user.pix_key}
                    className="flex-1 bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20"
                  >
                    Confirmar Saque
                  </button>
                </div>
                {!user.pix_key && (
                  <p className="text-center text-red-400 text-[10px] font-black uppercase tracking-widest">
                    Configure sua chave PIX nas configurações antes de sacar.
                  </p>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPaymentModal(null)}
              className="absolute inset-0 bg-zinc-950/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[3rem] p-10 shadow-2xl"
            >
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6">
                <ShieldCheck size={32} />
              </div>
              <h3 className="text-3xl font-black mb-2 tracking-tight uppercase">Pagamento Seguro</h3>
              <p className="text-zinc-500 text-sm font-medium mb-8">
                Seu pagamento será processado pelo Stripe e mantido em segurança até a conclusão da missão.
              </p>

              <CheckoutForm 
                amount={showPaymentModal.amount}
                targetType={showPaymentModal.targetType}
                targetId={showPaymentModal.targetId}
                username={user?.username || ''}
                onSuccess={() => {
                  setShowPaymentModal(null);
                  // Optional: show success toast
                }}
                onCancel={() => setShowPaymentModal(null)}
              />
              
              <p className="mt-6 text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                Powered by <span className="text-zinc-400">Stripe</span>
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Complete Challenge Modal */}
      <AnimatePresence>
        {showCompleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCompleteModal(null)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-[3rem] p-10 shadow-2xl"
            >
              <h3 className="text-3xl font-black mb-2 tracking-tight uppercase">Concluir Missão</h3>
              <p className="text-zinc-500 text-sm font-medium mb-8">Escolha como deseja provar a conclusão.</p>

              <div className="flex gap-4 mb-8">
                <button 
                  onClick={() => setCompletionMethod('video')}
                  className={`flex-1 p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                    completionMethod === 'video' 
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' 
                    : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <Video size={24} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Vídeo</span>
                </button>
                <button 
                  onClick={() => setCompletionMethod('live')}
                  className={`flex-1 p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                    completionMethod === 'live' 
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' 
                    : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <Radio size={24} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Ao Vivo</span>
                </button>
              </div>
              
              {completionMethod === 'video' ? (
                <form onSubmit={handleCompleteChallenge} className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">URL do Vídeo (YouTube/Vimeo/etc)</label>
                    <input 
                      required
                      type="url" 
                      value={completionData.video_url}
                      onChange={e => setCompletionData({...completionData, video_url: e.target.value})}
                      className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold"
                      placeholder="https://youtube.com/watch?v=..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">URL da Thumbnail (Opcional)</label>
                    <input 
                      type="url" 
                      value={completionData.thumbnail_url}
                      onChange={e => setCompletionData({...completionData, thumbnail_url: e.target.value})}
                      className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-all font-bold"
                      placeholder="https://exemplo.com/thumb.jpg"
                    />
                  </div>
                  <div className="pt-6 flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setShowCompleteModal(null)}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20"
                    >
                      Salvar Prova
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6 text-center">
                  <div className="py-10 bg-zinc-950 rounded-3xl border-2 border-dashed border-zinc-800 flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 animate-pulse">
                      <Radio size={32} />
                    </div>
                    <p className="text-zinc-400 font-medium px-8">
                      Inicie uma live para provar a conclusão em tempo real para seus seguidores.
                    </p>
                  </div>
                  <div className="pt-6 flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setShowCompleteModal(null)}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={() => {
                        setShowLivePanel(true);
                        // We keep showCompleteModal open or close it?
                        // Usually better to close it and open the live panel
                        // setShowCompleteModal(null);
                      }}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                    >
                      <Play size={16} />
                      Iniciar Live
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showLivePanel && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
            <div className="relative w-full h-full flex flex-col">
              {/* Video Background */}
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              
              {/* Overlay UI */}
              <div className="relative z-10 flex-1 flex flex-col p-6">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="bg-red-600 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center gap-2">
                      <Radio size={12} />
                      Ao Vivo
                    </div>
                    <div className="bg-black/40 backdrop-blur-md text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <Users size={12} />
                      1.2k
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowLivePanel(false)}
                    className="p-2 bg-black/40 backdrop-blur-md text-white rounded-full hover:bg-black/60 transition-all"
                  >
                    <XCircle size={24} />
                  </button>
                </div>

                <div className="flex-1" />

                <div className="max-w-md space-y-4">
                  <div className="bg-black/40 backdrop-blur-md p-6 rounded-[2rem] border border-white/10">
                    <h2 className="text-xl font-black text-white mb-1 uppercase tracking-tight">
                      {showCompleteModal?.title}
                    </h2>
                    <p className="text-white/60 text-xs font-medium">
                      Cumprindo missão ao vivo para os seguidores.
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={handleCompleteViaLive}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={18} />
                      Finalizar e Concluir Missão
                    </button>
                  </div>
                </div>
              </div>

              {/* Chat Simulation */}
              <div className="absolute right-6 bottom-32 w-64 space-y-2 pointer-events-none">
                {[
                  { user: 'lucas_dev', msg: 'VAI QUE É TUA! 🔥' },
                  { user: 'ana_clara', msg: 'Incrível! 🚀' },
                  { user: 'pedro_henrique', msg: 'Pagamento enviado! ✅' }
                ].map((chat, i) => (
                  <motion.div 
                    key={`chat-${i}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.5 }}
                    className="bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/5"
                  >
                    <span className="text-emerald-400 font-black text-[10px] block">@{chat.user}</span>
                    <p className="text-white text-[11px] font-medium">{chat.msg}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/80 backdrop-blur-2xl border border-zinc-800 px-8 py-4 rounded-full flex items-center gap-10 shadow-2xl md:hidden">
        <button onClick={() => setActiveTab('feed')} className={`transition-all ${activeTab === 'feed' ? 'text-emerald-400 scale-125' : 'text-zinc-500'}`}>
          <LayoutGrid size={24} />
        </button>
        <button onClick={() => setActiveTab('tasks')} className={`transition-all ${activeTab === 'tasks' ? 'text-emerald-400 scale-125' : 'text-zinc-500'}`}>
          <List size={24} />
        </button>
        <button onClick={() => setActiveTab('challenges')} className={`transition-all ${activeTab === 'challenges' ? 'text-emerald-400 scale-125' : 'text-zinc-500'}`}>
          <Zap size={24} />
        </button>
        <button onClick={() => setActiveTab('videos')} className={`transition-all ${activeTab === 'videos' ? 'text-emerald-400 scale-125' : 'text-zinc-500'}`}>
          <Video size={24} />
        </button>
        <button onClick={() => setActiveTab('ranking')} className={`transition-all ${activeTab === 'ranking' ? 'text-emerald-400 scale-125' : 'text-zinc-500'}`}>
          <TrendingUp size={24} />
        </button>
      </nav>
    </div>
  );
}
