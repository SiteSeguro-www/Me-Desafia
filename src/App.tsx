import React, { useState, useEffect } from 'react';
import { User, Task, Challenge, RankingUser } from './types';
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
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'tasks' | 'challenges' | 'ranking'>('feed');
  const [ranking, setRanking] = useState<RankingUser[]>([]);
  const [rankingSort, setRankingSort] = useState<'challenges_completed' | 'total_earned' | 'follower_count'>('challenges_completed');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', price: '' });
  const [newChallenge, setNewChallenge] = useState({ title: '', description: '', price: '' });
  const [viewMode, setViewMode] = useState<'creator' | 'follower'>('creator');

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

    return () => {
      unsubTasks();
      unsubChallenges();
      unsubRanking();
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
    // Simplified payment logic
    const path = `tasks/${taskId}`;
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: 'paid' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
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
                  TRANSMISSÃO AO VIVO
                </h3>
                <div className="flex items-center gap-4">
                  {viewMode === 'follower' && (
                    <button 
                      onClick={() => setShowChallengeModal(true)}
                      className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(16,185,129,0.4)] animate-pulse"
                    >
                      DESAFIE AGORA
                    </button>
                  )}
                  {isLive && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                      <span className="text-xs font-black text-red-500 uppercase tracking-widest">1.4k assistindo</span>
                    </div>
                  )}
                </div>
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
                          <img key={i} src={`https://picsum.photos/seed/user${i}/40`} className="w-10 h-10 rounded-full border-2 border-zinc-900" referrerPolicy="no-referrer" />
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
                <div className="py-32 text-center border-4 border-dashed border-zinc-900 rounded-[3rem] bg-zinc-900/20">
                  <VideoOff size={64} className="mx-auto mb-6 text-zinc-800" />
                  <h4 className="text-xl font-bold text-zinc-400 mb-2">Sistema Offline</h4>
                  <p className="text-zinc-600 font-medium">Inicie uma live para interagir com seus seguidores.</p>
                </div>
              )}
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
                          <div className="text-emerald-400 flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                            <CheckCircle2 size={18} />
                            Realizar
                          </div>
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
                            challenge.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-400' : 
                            challenge.status === 'refused' ? 'bg-red-500/20 text-red-400' : 
                            'bg-zinc-800 text-zinc-500'
                          }`}>
                            {challenge.status === 'pending' ? 'Novo Desafio' : challenge.status === 'accepted' ? 'Aceito' : 'Recusado'}
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
                        
                        {challenge.status === 'accepted' && (
                          <div className="text-emerald-400 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 size={16} />
                            Aceito
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
        <button onClick={() => setActiveTab('ranking')} className={`transition-all ${activeTab === 'ranking' ? 'text-emerald-400 scale-125' : 'text-zinc-500'}`}>
          <TrendingUp size={24} />
        </button>
      </nav>
    </div>
  );
}
