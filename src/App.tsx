import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { 
  Zap, 
  Send, 
  Youtube, 
  Smartphone, 
  FileText, 
  Camera, 
  ChevronRight, 
  Loader2, 
  CheckCircle2,
  BarChart3,
  Lightbulb,
  ArrowRight,
  MapPin,
  Sparkles,
  RefreshCw,
  History,
  X,
  Trash2,
  Clock,
  Image as ImageIcon,
  Video,
  Play,
  Download,
  AlertCircle,
  Key,
  Calendar as CalendarIcon,
  Plus,
  LayoutDashboard,
  Facebook,
  Instagram,
  Linkedin,
  ChevronLeft,
  Filter,
  Settings,
  MoreHorizontal,
  Edit3,
  Save,
  MessageSquare,
  Heart,
  Share2,
  Users
} from 'lucide-react';
import { 
  generateContent, 
  generateDirections, 
  getInitialSuggestions, 
  generateImage,
  generateMonthPlan,
  generateSinglePost,
  ContentOutput, 
  Suggestion,
  PlannedPost
} from './lib/gemini';
import { auth, db, signInWithGoogle, logOut } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';

type Tab = 'youtube' | 'short' | 'blog' | 'social' | 'plan' | 'visuals';

interface HistoryItem {
  id: string;
  timestamp: number;
  input: string;
  location: string;
  output: ContentOutput;
}

const LOCATIONS = ["Seattle", "Bellevue", "Mount Vernon"];

const DroppableCell = ({ dateStr, day, isCurrentMonth, children }: any) => {
  const { isOver, setNodeRef } = useDroppable({
    id: dateStr,
  });

  return (
    <div 
      ref={setNodeRef}
      className={`border-r border-b border-slate-100 p-2 space-y-2 transition-colors group min-h-[160px] ${
        isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50'
      } ${isOver ? 'bg-brand-primary/5 ring-2 ring-brand-primary ring-inset' : ''}`}
    >
      <span className={`text-xs font-bold transition-colors ${
        isCurrentMonth ? 'text-slate-400 group-hover:text-slate-900' : 'text-slate-300'
      }`}>
        {day}
      </span>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
};

const DraggablePost = ({ post, onClick, getPlatformIcon }: any) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
    data: post
  });

  return (
    <div 
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`p-1.5 bg-white border rounded-lg shadow-sm space-y-1 transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50 border-brand-primary shadow-md scale-105 z-10 relative' : 'border-slate-200 hover:border-brand-primary'
      }`}
    >
      <div className="flex items-center gap-1.5 pointer-events-none">
        {getPlatformIcon(post.platform)}
        <span className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">{post.type}</span>
      </div>
      <p className="text-xs font-bold text-slate-700 leading-tight line-clamp-2 pointer-events-none">{post.title}</p>
      <span className="text-[10px] font-medium text-slate-400 pointer-events-none">{post.time}</span>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [output, setOutput] = useState<ContentOutput | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('youtube');
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0]);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [view, setView] = useState<'engine' | 'calendar'>('engine');
  const [monthPlan, setMonthPlan] = useState<PlannedPost[]>([]);
  const [isGeneratingMonthPlan, setIsGeneratingMonthPlan] = useState(false);
  const [calendarFilters, setCalendarFilters] = useState({
    platform: 'all',
    status: 'all'
  });
  const [calendarViewMode, setCalendarViewMode] = useState<'Month' | 'Week' | 'List'>('Month');
  const [currentDate, setCurrentDate] = useState(new Date());

  // New State for Calendar Post Details & Month Plan Generation
  const [selectedPost, setSelectedPost] = useState<PlannedPost | null>(null);
  const [showMonthPlanModal, setShowMonthPlanModal] = useState(false);
  const [monthPlanFocus, setMonthPlanFocus] = useState('');
  const [postTone, setPostTone] = useState('Professional');
  const [postAudience, setPostAudience] = useState('Restaurant Owners');
  const [isGeneratingPost, setIsGeneratingPost] = useState(false);

  // Visuals State
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
        // Save user profile to DB
        try {
          await setDoc(doc(db, 'users', currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.error("Error saving user profile", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    
    if (user) {
      // Load history from Firestore
      const historyRef = collection(db, `users/${user.uid}/history`);
      const qHistory = query(historyRef, orderBy('timestamp', 'desc'));
      const unsubHistory = onSnapshot(qHistory, (snapshot) => {
        const historyData: HistoryItem[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          historyData.push({
            id: data.id,
            timestamp: data.timestamp,
            input: data.input,
            location: data.location,
            output: JSON.parse(data.output)
          });
        });
        setHistory(historyData);
        setHistoryLoaded(true);
      }, (error) => {
        console.error("Firestore history error", error);
      });

      // Load month plan from Firestore
      const planRef = collection(db, `users/${user.uid}/monthPlans`);
      const unsubPlan = onSnapshot(planRef, (snapshot) => {
        const planData: PlannedPost[] = [];
        snapshot.forEach(doc => {
          planData.push(doc.data() as PlannedPost);
        });
        setMonthPlan(planData);
      }, (error) => {
        console.error("Firestore plan error", error);
      });

      return () => {
        unsubHistory();
        unsubPlan();
      };
    } else {
      // Fallback to local storage if not logged in
      const savedHistory = localStorage.getItem('dicks_content_history');
      if (savedHistory) {
        try {
          setHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error('Failed to parse history', e);
        }
      }
      const savedPlan = localStorage.getItem('dicks_month_plan');
      if (savedPlan) {
        try {
          setMonthPlan(JSON.parse(savedPlan));
        } catch (e) {
          console.error('Failed to parse month plan', e);
        }
      }
      setHistoryLoaded(true);
    }
  }, [user, isAuthReady]);

  useEffect(() => {
    const checkApiKey = async () => {
      const selected = await (window as any).aistudio?.hasSelectedApiKey();
      setHasApiKey(!!selected);
    };
    checkApiKey();
    
    // Pass history to loadSuggestions to make it dynamic
    loadSuggestions();
  }, [historyLoaded]); // Re-load suggestions when history is loaded

  useEffect(() => {
    if (historyLoaded && !user) {
      localStorage.setItem('dicks_content_history', JSON.stringify(history));
      localStorage.setItem('dicks_month_plan', JSON.stringify(monthPlan));
    }
  }, [history, monthPlan, historyLoaded, user]);

  const handleOpenKeySelector = async () => {
    await (window as any).aistudio?.openSelectKey();
    setHasApiKey(true);
  };

  const handleGenerateMonthPlan = async () => {
    if (!monthPlanFocus.trim()) return;
    setIsGeneratingMonthPlan(true);
    try {
      const plan = await generateMonthPlan(monthPlanFocus, selectedLocation);
      
      if (user) {
        try {
          await Promise.all(plan.map(post => 
            setDoc(doc(db, `users/${user.uid}/monthPlans`, post.id), {
              ...post,
              userId: user.uid
            })
          ));
        } catch (e) {
          console.error("Failed to save month plan to Firestore", e);
        }
      } else {
        setMonthPlan(plan);
      }
      
      setView('calendar');
      setShowMonthPlanModal(false);
      setMonthPlanFocus('');
      toast.success("Month plan generated!");
    } catch (error) {
      console.error("Failed to generate month plan:", error);
      toast.error("Failed to generate month plan. Please try again.");
    } finally {
      setIsGeneratingMonthPlan(false);
    }
  };

  const handleGenerateSinglePost = async () => {
    if (!selectedPost) return;
    setIsGeneratingPost(true);
    try {
      const content = await generateSinglePost(selectedPost, postTone, postAudience, selectedLocation);
      const updatedPost = { ...selectedPost, content, status: 'in review' as const };
      
      if (user) {
        try {
          await setDoc(doc(db, `users/${user.uid}/monthPlans`, updatedPost.id), {
            ...updatedPost,
            userId: user.uid
          });
        } catch (e) {
          console.error("Failed to update post in Firestore", e);
        }
      } else {
        // Update in month plan
        setMonthPlan(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));
      }
      
      setSelectedPost(updatedPost);
      toast.success("Post content generated!");
    } catch (error) {
      console.error("Failed to generate post:", error);
      toast.error("Failed to generate post content. Please try again.");
    } finally {
      setIsGeneratingPost(false);
    }
  };

  const handleSavePostToHistory = async () => {
    if (!selectedPost || !selectedPost.content) return;
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      input: `Calendar Post: ${selectedPost.title}`,
      location: selectedLocation,
      output: {
        topicAngle: selectedPost.title,
        youtubeScript: selectedPost.platform === 'youtube' ? selectedPost.content : '',
        shortScript: selectedPost.type === 'video' && selectedPost.platform !== 'youtube' ? selectedPost.content : '',
        blogPost: selectedPost.type === 'article' ? selectedPost.content : '',
        socialPost: selectedPost.type === 'photo' || selectedPost.type === 'carousel' || selectedPost.platform === 'linkedin' || selectedPost.platform === 'facebook' ? selectedPost.content : '',
        filmingPlan: '',
        imagePrompt: ''
      }
    };
    
    if (user) {
      try {
        await setDoc(doc(db, `users/${user.uid}/history`, newItem.id), {
          ...newItem,
          userId: user.uid,
          output: JSON.stringify(newItem.output)
        });
      } catch (e) {
        console.error("Failed to save to Firestore", e);
      }
    } else {
      setHistory(prev => [newItem, ...prev].slice(0, 50));
    }
    toast.success("Saved to history!");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const loadSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      const res = await getInitialSuggestions(user?.displayName || null, history);
      setSuggestions(res);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load suggestions.");
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleInitialSubmit = async (e?: React.FormEvent, customInput?: string) => {
    if (e) e.preventDefault();
    const finalInput = customInput || input;
    if (!finalInput.trim()) return;

    setLoading(true);
    setGeneratedImageUrl(null);
    try {
      const res = await generateDirections(`${finalInput} (Location: ${selectedLocation})`);
      setDirections(res);
      setOutput(null);
      setSelectedDirection(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate directions.");
    } finally {
      setLoading(false);
    }
  };

  const handleDirectionSelect = async (direction: string) => {
    setSelectedDirection(direction);
    setLoading(true);
    try {
      const res = await generateContent(`${input} (Focus: ${direction}, Location: ${selectedLocation})`);
      setOutput(res);
      
      // Add to history
      const newItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        input: input,
        location: selectedLocation,
        output: res
      };
      
      if (user) {
        try {
          await setDoc(doc(db, `users/${user.uid}/history`, newItem.id), {
            ...newItem,
            userId: user.uid,
            output: JSON.stringify(newItem.output)
          });
        } catch (e) {
          console.error("Failed to save to Firestore", e);
        }
      } else {
        setHistory(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setInput(item.input);
    setSelectedLocation(item.location);
    setOutput(item.output);
    setDirections([]);
    setSelectedDirection(null);
    setShowHistory(false);
  };

  const deleteFromHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/history`, id));
      } catch (error) {
        console.error("Failed to delete from Firestore", error);
        toast.error("Failed to delete item.");
      }
    } else {
      setHistory(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setInput(suggestion.rawInput);
    handleInitialSubmit(undefined, suggestion.rawInput);
  };

  const handleGenerateImage = async () => {
    if (!output) return;
    setGeneratingImage(true);
    try {
      const url = await generateImage(output.imagePrompt);
      setGeneratedImageUrl(url);
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingImage(false);
    }
  };

  const getTabLabel = (tab: Tab) => {
    switch(tab) {
      case 'youtube': return 'YouTube Script';
      case 'short': return 'Short-form Script';
      case 'blog': return 'Blog Post';
      case 'social': return 'Social Media';
      case 'plan': return 'Filming Plan';
      case 'visuals': return 'Visual Assets';
    }
  };

  const getTabDescription = (tab: Tab) => {
    switch(tab) {
      case 'youtube': return 'Authority-building long-form content';
      case 'short': return 'High-traffic Reels/TikTok/Shorts';
      case 'blog': return 'SEO-optimized website content';
      case 'social': return 'Engagement for LinkedIn/Facebook';
      case 'plan': return 'On-site execution & shot list';
      case 'visuals': return 'AI-generated images and video teasers';
    }
  };

  const getActiveContent = () => {
    if (!output) return '';
    switch(activeTab) {
      case 'youtube': return output.youtubeScript;
      case 'short': return output.shortScript;
      case 'blog': return output.blogPost;
      case 'social': return output.socialPost;
      case 'plan': return output.filmingPlan;
    }
  };

  const CalendarView = () => {
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const prevMonthDays = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();
    const monthName = currentDate.toLocaleString('default', { month: 'long' });
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const cells: { day: number; isCurrentMonth: boolean; dateStr: string }[] = [];

    const formatDate = (y: number, m: number, d: number) => {
      const date = new Date(y, m, d);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    // Previous month's trailing days
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({ day: d, isCurrentMonth: false, dateStr: formatDate(year, month - 1, d) });
    }

    // Current month's days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, isCurrentMonth: true, dateStr: formatDate(year, month, d) });
    }

    // Next month's leading days
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        cells.push({ day: d, isCurrentMonth: false, dateStr: formatDate(year, month + 1, d) });
      }
    }

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 5 },
      })
    );

    const [activeId, setActiveId] = useState<string | null>(null);
    const activePost = activeId ? monthPlan.find(p => p.id === activeId) : null;

    const handleDragStart = (event: DragStartEvent) => {
      setActiveId(event.active.id as string);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const postId = active.id as string;
      const newDateStr = over.id as string;

      const postToMove = monthPlan.find(p => p.id === postId);
      if (postToMove && postToMove.date !== newDateStr) {
        const updatedPost = { ...postToMove, date: newDateStr };
        
        if (user) {
          try {
            await setDoc(doc(db, `users/${user.uid}/monthPlans`, updatedPost.id), {
              ...updatedPost,
              userId: user.uid
            });
          } catch (e) {
            console.error("Failed to update post date in Firestore", e);
          }
        } else {
          setMonthPlan(prev => prev.map(p => 
            p.id === postId ? updatedPost : p
          ));
        }
        toast.success("Post rescheduled");
      }
    };

    const getPlatformIcon = (platform: string) => {
      switch(platform) {
        case 'youtube': return <Youtube className="w-3 h-3 text-red-600" />;
        case 'linkedin': return <Linkedin className="w-3 h-3 text-blue-700" />;
        case 'instagram': return <Instagram className="w-3 h-3 text-pink-600" />;
        case 'facebook': return <Facebook className="w-3 h-3 text-blue-600" />;
        default: return null;
      }
    };

    const navigateMonth = (direction: number) => {
      const newDate = new Date(currentDate);
      newDate.setMonth(currentDate.getMonth() + direction);
      setCurrentDate(newDate);
    };

    const filteredMonthPlan = monthPlan.filter(post => {
      const platformMatch = calendarFilters.platform === 'all' || post.platform === calendarFilters.platform;
      const statusMatch = calendarFilters.status === 'all' || post.status === calendarFilters.status;
      return platformMatch && statusMatch;
    });

    return (
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <header className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => navigateMonth(-1)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
              >
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <button 
                onClick={() => navigateMonth(1)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
              >
                <ChevronRight className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <h2 className="text-xl font-bold text-slate-900">{monthName} {year}</h2>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            {(['Month', 'Week', 'List'] as const).map(v => (
              <button 
                key={v} 
                onClick={() => setCalendarViewMode(v)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarViewMode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {calendarViewMode === 'Month' && (
            <>
              <div className="grid grid-cols-7 border-b border-slate-200">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                  <div key={day} className="py-3 text-center text-xs font-bold text-slate-400 tracking-widest border-r border-slate-200 last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-7 auto-rows-[minmax(160px,auto)]">
                  {cells.map((cell, idx) => {
                    const dayPosts = filteredMonthPlan.filter(p => p.date.startsWith(cell.dateStr));

                    return (
                      <DroppableCell key={idx} dateStr={cell.dateStr} day={cell.day} isCurrentMonth={cell.isCurrentMonth}>
                        {dayPosts.map(post => (
                          <DraggablePost 
                            key={post.id} 
                            post={post} 
                            onClick={() => setSelectedPost(post)} 
                            getPlatformIcon={getPlatformIcon} 
                          />
                        ))}
                      </DroppableCell>
                    );
                  })}
                </div>
                <DragOverlay>
                  {activePost ? (
                    <DraggablePost 
                      post={activePost} 
                      onClick={() => {}} 
                      getPlatformIcon={getPlatformIcon} 
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            </>
          )}

          {calendarViewMode === 'Week' && (
            <div className="p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                <CalendarIcon className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Week View Coming Soon</h3>
              <p className="text-slate-500 max-w-xs mx-auto">We're currently optimizing the weekly execution view for your team.</p>
            </div>
          )}

          {calendarViewMode === 'List' && (
            <div className="p-6 space-y-4">
              {filteredMonthPlan.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(post => (
                <div key={post.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl hover:border-brand-primary transition-all cursor-pointer group">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-brand-primary/10 transition-colors">
                    {getPlatformIcon(post.platform)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">{post.platform}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-400">{new Date(post.date).toLocaleDateString()} at {post.time}</span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-lg">{post.title}</h4>
                  </div>
                  <div className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-500 uppercase">
                    {post.type}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex overflow-hidden">
      <Toaster position="top-center" />
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0">
        <div className="p-8 space-y-8">
          <button 
            onClick={() => {
              setView('engine');
              setDirections([]);
              setOutput(null);
            }}
            className="block w-full text-left"
          >
            <img 
              src="/dickslogo.png" 
              alt="Dick's Restaurant Supply" 
              className="w-full h-auto brightness-0 invert"
              referrerPolicy="no-referrer"
            />
          </button>

          <button 
            onClick={() => {
              setView('engine');
              setDirections([]);
              setOutput(null);
            }}
            className="w-full py-4 bg-brand-primary hover:bg-brand-secondary text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-brand-primary/20"
          >
            <Plus className="w-6 h-6" />
            New Campaign
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-6 space-y-2 pb-8 custom-scrollbar">
          <h3 className="px-4 text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Navigation</h3>
          
          <button 
            onClick={() => setView('engine')}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-base font-bold transition-all ${
              view === 'engine' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Zap className="w-5 h-5" />
            Content Engine
          </button>

          <button 
            onClick={() => setView('calendar')}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-base font-bold transition-all ${
              view === 'calendar' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <CalendarIcon className="w-5 h-5" />
            Content Calendar
          </button>

          <button 
            onClick={() => setShowHistory(true)}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-base font-bold text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all"
          >
            <History className="w-5 h-5" />
            History
          </button>

          <div className="pt-8 space-y-4">
            <h3 className="px-4 text-xs font-bold uppercase tracking-widest text-slate-500">Quick Actions</h3>
            <button 
              onClick={() => setShowMonthPlanModal(true)}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-base font-bold text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all"
            >
              <Sparkles className="w-5 h-5" />
              Generate Month Plan
            </button>
            <button 
              className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-base font-bold text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all"
            >
              <Settings className="w-5 h-5" />
              Settings
            </button>
          </div>
        </nav>

        {/* User Profile / Auth */}
        <div className="p-6 border-t border-slate-800">
          {user ? (
            <div className="flex items-center justify-between gap-3 bg-slate-800/50 p-3 rounded-2xl border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center text-white font-bold">
                  {user.displayName?.[0] || user.email?.[0]}
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-bold text-white truncate max-w-[120px]">{user.displayName || 'User'}</span>
                  <span className="text-xs text-slate-500 truncate max-w-[120px]">{user.email}</span>
                </div>
              </div>
              <button 
                onClick={logOut}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={signInWithGoogle}
              className="w-full py-3 bg-white text-slate-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-all"
            >
              <Users className="w-5 h-5" />
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {view === 'calendar' ? (
          <CalendarView />
        ) : (
          <>
            {/* History Sidebar (Overlay) */}
            <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-brand-primary" />
                  <h2 className="text-xl font-bold text-slate-900">Content History</h2>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-2">
                    <Clock className="w-12 h-12 opacity-20" />
                    <p className="font-medium">No history yet</p>
                    <p className="text-xs">Generated ideas will appear here</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="group p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:border-brand-primary hover:bg-white hover:shadow-md transition-all cursor-pointer relative"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-brand-primary uppercase tracking-wider bg-rose-50 px-2 py-0.5 rounded">
                            {item.location}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-base line-clamp-2">
                          {item.input}
                        </h4>
                        <p className="text-sm text-slate-500 line-clamp-1 italic">
                          {item.output.topicAngle}
                        </p>
                      </div>
                      <button
                        onClick={(e) => deleteFromHistory(item.id, e)}
                        className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all text-slate-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          {(directions.length > 0 || output) && (
            <button 
              onClick={() => {
                if (output) {
                  setOutput(null);
                } else {
                  setDirections([]);
                }
              }}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
              title="Go Back"
            >
              <ArrowRight className="w-6 h-6 rotate-180" />
            </button>
          )}
          <button 
            onClick={() => {
              setView('engine');
              setDirections([]);
              setOutput(null);
            }}
            className="flex items-center gap-4 group"
          >
            <img 
              src="/dickslogo.png" 
              alt="Dick's Restaurant Supply" 
              className="h-10 w-auto group-hover:scale-105 transition-transform"
              referrerPolicy="no-referrer"
            />
            <div className="h-8 w-px bg-slate-200 hidden sm:block" />
            <h1 className="text-2xl font-black tracking-tighter text-slate-900 hidden sm:block">
              CONTENT<span className="text-brand-primary">ENGINE</span>
            </h1>
          </button>
        </div>
        
        <div className="hidden lg:flex items-center gap-8">
          <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
            <MapPin className="w-5 h-5 text-brand-primary" />
            <select 
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-transparent text-base font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              {LOCATIONS.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live Context Active
            </div>
            {user ? (
              <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                <div className="text-right hidden xl:block">
                  <p className="text-sm font-bold text-slate-900">{user.displayName}</p>
                  <p className="text-xs text-slate-500">Administrator</p>
                </div>
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
                  <Users className="w-5 h-5 text-slate-600" />
                </div>
              </div>
            ) : (
              <button 
                onClick={signInWithGoogle}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 w-full p-6 md:p-10 space-y-10 overflow-y-auto custom-scrollbar">
        {/* Hero / Input Section */}
        <section className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-primary font-bold text-base uppercase tracking-widest">
              <Sparkles className="w-5 h-5" />
              Real-Time Decision Infrastructure
            </div>
            <h2 className="text-4xl font-bold text-slate-900">
              {user ? `Hello ${user.displayName?.split(' ')[0] || 'there'}, what's happening at ${selectedLocation}?` : `What's happening at ${selectedLocation}?`}
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl">
              Turn any daily activity into a full content department in a button. 
              Thinking is automated.
            </p>
          </div>

          <form onSubmit={handleInitialSubmit} className="relative group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., We just installed new fryers at a restaurant in Seattle..."
              className="w-full px-6 py-5 bg-white border-2 border-slate-200 rounded-2xl text-lg focus:outline-none focus:border-brand-primary transition-all shadow-sm group-hover:shadow-md pr-16"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="absolute right-3 top-3 bottom-3 px-4 bg-brand-primary text-white rounded-xl font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>

          {/* Initial Suggestions */}
          {!directions.length && !output && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-400 uppercase tracking-wider flex items-center gap-3">
                  <Lightbulb className="w-6 h-6 text-brand-primary" />
                  Suggested Starters (Based on your history & dicksrestaurantsupply.com)
                </h3>
                <button 
                  onClick={loadSuggestions}
                  disabled={suggestionsLoading}
                  className="text-sm font-bold text-brand-primary hover:underline flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${suggestionsLoading ? 'animate-spin' : ''}`} />
                  Refresh Ideas
                </button>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {suggestionsLoading ? (
                  Array(6).fill(0).map((_, i) => (
                    <div key={i} className="h-40 bg-slate-100 animate-pulse rounded-3xl border border-slate-200" />
                  ))
                ) : (
                  suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s)}
                      className="p-8 bg-white border border-slate-200 rounded-3xl text-left hover:border-brand-primary hover:shadow-xl transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Sparkles className="w-12 h-12 text-brand-primary" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-lg mb-3 group-hover:text-brand-primary transition-colors">{s.title}</h4>
                      <p className="text-sm text-slate-500 leading-relaxed line-clamp-3 mb-6">{s.description}</p>
                      <div className="flex items-center gap-2 text-xs font-bold text-brand-primary uppercase tracking-widest">
                        Launch Campaign <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        <AnimatePresence mode="wait">
          {/* Strategic Directions Section */}
          {directions.length > 0 && !output && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xl">
                <Lightbulb className="w-6 h-6 text-amber-500" />
                Choose a Strategic Direction
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {directions.map((dir, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleDirectionSelect(dir)}
                    className="p-6 bg-white border border-slate-200 rounded-2xl text-left hover:border-brand-primary hover:shadow-lg transition-all group relative overflow-hidden"
                  >
                    <div className="relative z-10 space-y-3">
                      <div className="text-sm font-bold text-brand-primary uppercase tracking-wider">Option 0{idx + 1}</div>
                      <p className="font-medium text-slate-800 leading-relaxed">{dir}</p>
                      <div className="flex items-center gap-1 text-sm font-bold text-slate-400 group-hover:text-brand-primary transition-colors">
                        Generate Engine <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <BarChart3 className="w-16 h-16" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          {/* Main Output Section */}
          {output && (
            <motion.section
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              {/* Strategy Header */}
              <div className="bg-brand-dark text-white p-10 rounded-3xl shadow-xl space-y-6">
                <div className="flex items-center gap-3 text-brand-primary font-bold uppercase tracking-widest text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Strategy Locked for {selectedLocation}
                </div>
                <h3 className="text-3xl md:text-4xl font-bold leading-tight">
                  {output.topicAngle}
                </h3>
                <div className="flex flex-wrap gap-4 pt-2">
                  <span className="px-4 py-2 bg-white/10 rounded-full text-sm font-medium">Authority Building</span>
                  <span className="px-4 py-2 bg-white/10 rounded-full text-sm font-medium">Lead Generation</span>
                  <span className="px-4 py-2 bg-white/10 rounded-full text-sm font-medium">Operational Excellence</span>
                </div>
              </div>

              {/* Content Tabs */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex border-b border-slate-100 overflow-x-auto bg-slate-50/50">
                  {(['youtube', 'short', 'blog', 'social', 'plan', 'visuals'] as Tab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 min-w-[150px] px-6 py-6 text-base font-bold flex flex-col items-center gap-2 transition-all border-b-2 ${
                        activeTab === tab 
                          ? 'text-brand-primary border-brand-primary bg-white shadow-[inset_0_-2px_0_0_#e11d48]' 
                          : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-white/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {tab === 'youtube' && <Youtube className="w-5 h-5" />}
                        {tab === 'short' && <Smartphone className="w-5 h-5" />}
                        {tab === 'blog' && <FileText className="w-5 h-5" />}
                        {tab === 'social' && <Sparkles className="w-5 h-5" />}
                        {tab === 'plan' && <Camera className="w-5 h-5" />}
                        {tab === 'visuals' && <ImageIcon className="w-5 h-5" />}
                        {getTabLabel(tab)}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h4 className="text-xl font-bold text-slate-900">{getTabLabel(activeTab)}</h4>
                      <p className="text-sm text-slate-500">{getTabDescription(activeTab)}</p>
                    </div>
                    {activeTab !== 'visuals' && (
                      <button 
                        onClick={() => copyToClipboard(getActiveContent())}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                      >
                        {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <FileText className="w-3 h-3" />}
                        {copied ? 'Copied!' : 'Copy to Clipboard'}
                      </button>
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="prose prose-slate max-w-none"
                    >
                      {activeTab === 'visuals' ? (
                        <div className="space-y-8">
                          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                            <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-blue-900">Context-Aware Visuals</p>
                              <p className="text-xs text-blue-700 leading-relaxed">
                                These prompts were specifically engineered based on your <strong>YouTube Script</strong> and <strong>Blog Post</strong> to ensure visual consistency across all channels.
                              </p>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-1 gap-8">
                            {/* Image Generation */}
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                            <div className="flex items-center justify-between">
                              <h5 className="font-bold text-slate-900 flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-brand-primary" />
                                Hero Image
                              </h5>
                              {!hasApiKey && (
                                <button 
                                  onClick={handleOpenKeySelector}
                                  className="text-[10px] font-bold text-brand-primary flex items-center gap-1 hover:underline"
                                >
                                  <Key className="w-3 h-3" />
                                  Setup API Key
                                </button>
                              )}
                            </div>
                            
                            <div className="aspect-video bg-slate-200 rounded-xl overflow-hidden relative group">
                              {generatedImageUrl ? (
                                <img 
                                  src={generatedImageUrl} 
                                  alt="Generated Hero" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                                  <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                                  <p className="text-xs font-medium">No image generated yet</p>
                                </div>
                              )}
                              {generatingImage && (
                                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center text-brand-primary">
                                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                  <p className="text-xs font-bold uppercase tracking-widest">Painting...</p>
                                </div>
                              )}
                            </div>

                            <div className="space-y-3">
                              <p className="text-xs text-slate-500 italic leading-relaxed">
                                <span className="font-bold text-slate-700 not-italic">AI Prompt:</span> {output.imagePrompt}
                              </p>
                              <button
                                onClick={handleGenerateImage}
                                disabled={generatingImage || !hasApiKey}
                                className="w-full py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:border-brand-primary hover:text-brand-primary transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                {generatedImageUrl ? 'Regenerate Image' : 'Generate Hero Image'}
                              </button>
                            </div>
                          </div>

                          {!hasApiKey && (
                            <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <p className="text-sm font-bold text-rose-900">API Key Required for Visuals</p>
                                <p className="text-xs text-rose-700 leading-relaxed">
                                  To generate images, you need to select a paid Gemini API key. 
                                  Click the "Setup API Key" button above to continue.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      ) : activeTab === 'social' ? (
                        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-brand-primary rounded-full flex items-center justify-center text-white font-bold">DR</div>
                            <div>
                              <div className="font-bold text-sm text-slate-900">Dick's Restaurant Supply</div>
                              <div className="text-xs text-slate-500">Sponsored</div>
                            </div>
                          </div>
                          <div className="px-4 pb-3 text-sm text-slate-800 whitespace-pre-wrap">
                            {output.socialPost}
                          </div>
                          {generatedImageUrl && (
                            <img src={generatedImageUrl} className="w-full h-auto" alt="Social Post Visual" />
                          )}
                          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-slate-500">
                            <button className="flex items-center gap-2 text-sm font-medium hover:text-brand-primary transition-colors"><Heart className="w-4 h-4"/> Like</button>
                            <button className="flex items-center gap-2 text-sm font-medium hover:text-brand-primary transition-colors"><MessageSquare className="w-4 h-4"/> Comment</button>
                            <button className="flex items-center gap-2 text-sm font-medium hover:text-brand-primary transition-colors"><Share2 className="w-4 h-4"/> Share</button>
                          </div>
                        </div>
                      ) : activeTab === 'plan' ? (
                        <div className="space-y-4">
                          {output.filmingPlan.split(/(?=\d+\.)/).map((step, i) => {
                            const cleanStep = step.replace(/^\d+\.\s*/, '').trim();
                            if (!cleanStep) return null;
                            return (
                              <div key={i} className="flex gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold shrink-0">
                                  {i + 1}
                                </div>
                                <p className="text-sm text-slate-700 leading-relaxed pt-1">{cleanStep}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : activeTab === 'youtube' ? (
                        <div className="prose prose-sm max-w-none text-slate-700">
                          {output.youtubeScript.split('\n').map((paragraph, i) => (
                            <p key={i} className="mb-4">{paragraph}</p>
                          ))}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-700 bg-slate-50 p-8 rounded-2xl border border-slate-100 shadow-inner min-h-[300px]">
                          {getActiveContent()}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Action Footer */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-8 bg-slate-100 rounded-3xl border border-slate-200">
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">Ready to execute?</p>
                  <p className="text-sm text-slate-500">Thinking is automated. Now, hand this to the team.</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                  <button 
                    onClick={() => window.print()}
                    className="flex-1 md:flex-none px-6 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Export PDF
                  </button>
                  <button 
                    onClick={() => {
                      setOutput(null);
                      setDirections([]);
                      setInput('');
                    }}
                    className="flex-1 md:flex-none px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:bg-rose-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-200"
                  >
                    <Zap className="w-4 h-4" />
                    New Activity
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Empty State / Benefits - Removed as per user request */}
      </div>
    </>
  )}

  {/* Footer */}
  <footer className="p-4 text-center text-slate-400 text-xs border-t border-slate-200 bg-white shrink-0">
    &copy; 2026 Dick's Restaurant Supply &bull; Powered by Palmer House Decision Infrastructure
  </footer>
</main>

{/* Month Plan Modal */}
<AnimatePresence>
    {showMonthPlanModal && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowMonthPlanModal(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-3xl shadow-2xl z-50 overflow-hidden"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center">
                <CalendarIcon className="w-5 h-5 text-brand-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Generate Month Plan</h2>
                <p className="text-xs text-slate-500">Create a 30-day content calendar</p>
              </div>
            </div>
            <button onClick={() => setShowMonthPlanModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700">What should this month focus on?</label>
              <textarea
                value={monthPlanFocus}
                onChange={(e) => setMonthPlanFocus(e.target.value)}
                placeholder="e.g., Highlighting our new commercial refrigeration units, promoting seasonal maintenance services, and showcasing customer success stories in Seattle."
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all resize-none h-32"
              />
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700">Suggested Focus Areas</label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Educational equipment maintenance",
                  "Seasonal menu upgrades",
                  "Energy-efficient appliances",
                  "Kitchen workflow optimization"
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => setMonthPlanFocus(suggestion)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-brand-primary/10 hover:text-brand-primary text-slate-600 rounded-lg text-xs font-medium transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button
              onClick={() => setShowMonthPlanModal(false)}
              className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateMonthPlan}
              disabled={!monthPlanFocus.trim() || isGeneratingMonthPlan}
              className="px-6 py-2.5 bg-brand-primary text-white text-sm font-bold rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-brand-primary/20"
            >
              {isGeneratingMonthPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Plan
            </button>
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>

  {/* Single Post Details Modal */}
  <AnimatePresence>
    {selectedPost && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSelectedPost(null)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[90vh] bg-white rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm">
                {selectedPost.platform === 'youtube' && <Youtube className="w-6 h-6 text-red-600" />}
                {selectedPost.platform === 'linkedin' && <Linkedin className="w-6 h-6 text-blue-700" />}
                {selectedPost.platform === 'instagram' && <Instagram className="w-6 h-6 text-pink-600" />}
                {selectedPost.platform === 'facebook' && <Facebook className="w-6 h-6 text-blue-600" />}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-bold text-brand-primary uppercase tracking-wider bg-brand-primary/10 px-3 py-1 rounded-full">
                    {selectedPost.platform}
                  </span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-200 px-3 py-1 rounded-full">
                    {selectedPost.type}
                  </span>
                  <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                    selectedPost.status === 'draft' ? 'bg-slate-200 text-slate-600' :
                    selectedPost.status === 'in review' ? 'bg-amber-100 text-amber-700' :
                    selectedPost.status === 'scheduled' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {selectedPost.status}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedPost.title}</h2>
                <p className="text-sm text-slate-500 flex items-center gap-2 mt-2">
                  <CalendarIcon className="w-4 h-4" />
                  {new Date(selectedPost.date).toLocaleDateString()} at {selectedPost.time}
                </p>
              </div>
            </div>
            <button onClick={() => setSelectedPost(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Left Column: Settings */}
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Generation Settings
                  </h3>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Tone of Voice</label>
                    <select 
                      value={postTone}
                      onChange={(e) => setPostTone(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-all"
                    >
                      <option>Professional & Authoritative</option>
                      <option>Casual & Friendly</option>
                      <option>Educational & Helpful</option>
                      <option>Urgent & Sales-Focused</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">Target Audience</label>
                    <select 
                      value={postAudience}
                      onChange={(e) => setPostAudience(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-all"
                    >
                      <option>Restaurant Owners</option>
                      <option>Head Chefs</option>
                      <option>Food Truck Operators</option>
                      <option>Catering Businesses</option>
                    </select>
                  </div>

                  <button
                    onClick={handleGenerateSinglePost}
                    disabled={isGeneratingPost}
                    className="w-full py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-brand-primary/20 mt-4"
                  >
                    {isGeneratingPost ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {selectedPost.content ? 'Regenerate Content' : 'Generate Content'}
                  </button>
                </div>
              </div>

              {/* Right Column: Content */}
              <div className="md:col-span-2">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Generated Content
                    </h3>
                    {selectedPost.content && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => copyToClipboard(selectedPost.content!)}
                          className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                          title="Copy to clipboard"
                        >
                          {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <FileText className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {isGeneratingPost ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
                        <p className="text-sm font-medium">Crafting the perfect post...</p>
                      </div>
                    ) : selectedPost.content ? (
                      <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-700">
                        {selectedPost.content}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-12">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                          <Sparkles className="w-8 h-8 text-slate-300" />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="text-sm font-bold text-slate-600">No content generated yet</p>
                          <p className="text-xs text-slate-400 max-w-[200px]">Adjust settings on the left and click Generate to create this post.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <select
                value={selectedPost.status}
                onChange={(e) => {
                  const updated = { ...selectedPost, status: e.target.value as any };
                  setMonthPlan(prev => prev.map(p => p.id === selectedPost.id ? updated : p));
                  setSelectedPost(updated);
                }}
                className="text-xs font-bold text-slate-600 bg-slate-100 border-none rounded-lg px-3 py-2 focus:ring-0 cursor-pointer"
              >
                <option value="draft">Draft</option>
                <option value="in review">In Review</option>
                <option value="scheduled">Scheduled</option>
                <option value="posted">Posted</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedPost(null)}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleSavePostToHistory}
                disabled={!selectedPost.content}
                className="px-6 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-slate-900/20"
              >
                <Save className="w-4 h-4" />
                Save to History
              </button>
            </div>
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
</div>
);
}
