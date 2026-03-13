export interface User {
  uid: string;
  username: string;
  display_name: string;
  email: string;
  bio: string;
  avatar_url: string;
  role: 'creator' | 'follower';
  points: number;
  balance: number;
  followers: number;
  completedTasks: number;
  createdAt: any;
}

export interface Task {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  points: number;
  price: number;
  status: 'pending' | 'paid' | 'completed';
  created_at: any;
}

export interface Challenge {
  id: string;
  creatorId: string;
  followerId: string;
  follower_username: string;
  title: string;
  description: string;
  price: number;
  total_raised: number;
  status: 'pending' | 'accepted' | 'refused' | 'paid';
  created_at: any;
}

export interface RankingUser {
  uid: string;
  username: string;
  display_name: string;
  avatar_url: string;
  challenges_completed: number;
  total_earned: number;
  follower_count: number;
}
