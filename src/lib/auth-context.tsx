"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  getCurrentUser,
  getSession,
  signIn as cognitoSignIn,
  signUp as cognitoSignUp,
  confirmSignUp as cognitoConfirm,
  signOut as cognitoSignOut,
} from "./auth";

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  isAuthenticated: false,
  userId: null,
  email: null,
  signIn: async () => {},
  signUp: async () => {},
  confirmSignUp: async () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const session = await getSession();
      const payload = session.getIdToken().decodePayload();
      setUserId(payload.sub);
      setEmail(payload.email);
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
      setUserId(null);
      setEmail(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const signIn = async (email: string, password: string) => {
    await cognitoSignIn(email, password);
    await loadSession();
  };

  const signUp = async (email: string, password: string) => {
    await cognitoSignUp(email, password);
  };

  const confirmSignUp = async (email: string, code: string) => {
    await cognitoConfirm(email, code);
  };

  const signOut = () => {
    cognitoSignOut();
    setIsAuthenticated(false);
    setUserId(null);
    setEmail(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        userId,
        email,
        signIn,
        signUp,
        confirmSignUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
