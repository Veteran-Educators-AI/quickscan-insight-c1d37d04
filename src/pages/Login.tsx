import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft, CheckCircle, Chrome, AlertCircle, Loader2, Play, Shield, GraduationCap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { validateEmail, validatePassword } from '@/lib/passwordValidation';
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';
import { useSchoolBranding } from '@/hooks/useSchoolBranding';
import { PoweredByBadge } from '@/components/PoweredByBadge';
import nycologicLogo from '@/assets/nycologic-brain-logo.png';

const REMEMBER_ME_KEY = 'scan_genius_remember_me';

// Demo account credentials
const DEMO_ACCOUNTS = {
  teacher: {
    email: 'demo.teacher@nyclogic.edu',
    password: 'DemoTeacher2025!',
    label: 'Teacher Demo',
    description: 'Explore classroom features',
    icon: GraduationCap,
  },
  admin: {
    email: 'demo.admin@nyclogic.edu',
    password: 'DemoAdmin2025!',
    label: 'Admin Demo',
    description: 'Full system access',
    icon: Shield,
  },
};

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const [demoLoading, setDemoLoading] = useState<'teacher' | 'admin' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailSent, setForgotEmailSent] = useState(false);
  const [signupEmailSent, setSignupEmailSent] = useState(false);
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword, authError, clearAuthError } = useAuth();
  const { toast } = useToast();
  const { branding, isCustomBranding } = useSchoolBranding();

  // Show retry button after 5 seconds of loading
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      setShowRetry(false);
      timer = setTimeout(() => setShowRetry(true), 5000);
    } else {
      setShowRetry(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  const handleRetry = () => {
    setIsLoading(false);
    setShowRetry(false);
    toast({
      title: "Login cancelled",
      description: "Please try signing in again.",
    });
  };

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginEmailError, setLoginEmailError] = useState('');

  // Signup form state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupEmailError, setSignupEmailError] = useState('');
  const [signupEmailTouched, setSignupEmailTouched] = useState(false);
  const [signupPasswordTouched, setSignupPasswordTouched] = useState(false);

  // Demo login handler
  const handleDemoLogin = async (type: 'teacher' | 'admin') => {
    const demo = DEMO_ACCOUNTS[type];
    setDemoLoading(type);
    
    const { error } = await signIn(demo.email, demo.password);
    
    if (error) {
      toast({
        title: "Demo login failed",
        description: "Demo account may not be set up yet. Please contact support or try again later.",
        variant: "destructive",
      });
    } else {
      toast({
        title: `Welcome to ${demo.label}!`,
        description: "You're exploring the system with demo access.",
      });
      navigate('/dashboard');
    }
    
    setDemoLoading(null);
  };

  // Password validation
  const passwordValidation = useMemo(
    () => validatePassword(signupPassword),
    [signupPassword]
  );

  const passwordsMatch = signupPassword === signupConfirmPassword;
  const confirmPasswordError = signupConfirmPassword && !passwordsMatch;

  // Load remembered credentials on mount
  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBER_ME_KEY);
    if (remembered) {
      try {
        const { email, password } = JSON.parse(remembered);
        setLoginEmail(email || '');
        setLoginPassword(password || '');
        setRememberMe(true);
      } catch (e) {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }
    }
  }, []);

  // Validate login email on blur
  const handleLoginEmailBlur = () => {
    if (loginEmail && !validateEmail(loginEmail)) {
      setLoginEmailError('Please enter a valid email address');
    } else {
      setLoginEmailError('');
    }
  };

  // Validate signup email on blur
  const handleSignupEmailBlur = () => {
    setSignupEmailTouched(true);
    if (signupEmail && !validateEmail(signupEmail)) {
      setSignupEmailError('Please enter a valid email address');
    } else {
      setSignupEmailError('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email format
    if (!validateEmail(loginEmail)) {
      setLoginEmailError('Please enter a valid email address');
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await signIn(loginEmail.trim(), loginPassword);

    if (error) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      // Save or clear remembered credentials
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ email: loginEmail, password: loginPassword }));
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }
      toast({
        title: "Welcome back!",
        description: "Successfully signed in.",
      });
      navigate('/dashboard');
    }

    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email format
    if (!validateEmail(signupEmail)) {
      setSignupEmailError('Please enter a valid email address');
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    // Validate password strength
    if (!passwordValidation.isValid) {
      const failedReqs = passwordValidation.requirements
        .filter(r => !r.met)
        .slice(0, 2)
        .map(r => r.label.toLowerCase())
        .join(', ');
      toast({
        title: "Weak password",
        description: `Please include: ${failedReqs}`,
        variant: "destructive",
      });
      return;
    }

    // Validate password match
    if (!passwordsMatch) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    // Validate name
    if (signupName.trim().length < 2) {
      toast({
        title: "Name required",
        description: "Please enter your full name.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await signUp(signupEmail.trim(), signupPassword, signupName.trim());

    if (error) {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setSignupEmailSent(true);
      toast({
        title: "Verification email sent!",
        description: "Please check your inbox to verify your email address.",
      });
    }

    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(forgotEmail)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await resetPassword(forgotEmail.trim());

    if (error) {
      toast({
        title: "Failed to send reset email",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setForgotEmailSent(true);
      toast({
        title: "Reset email sent!",
        description: "Check your inbox for the password reset link.",
      });
    }

    setIsLoading(false);
  };

  const canSubmitSignup =
    signupName.trim().length >= 2 &&
    validateEmail(signupEmail) &&
    passwordValidation.isValid &&
    passwordsMatch &&
    signupConfirmPassword.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in flex-1 flex flex-col justify-center">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={branding.logo || nycologicLogo}
            alt={`${branding.displayName} ${branding.aiSuffix}`}
            className="h-44 w-auto mx-auto mb-2"
          />
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-5xl md:text-6xl font-bold text-foreground tracking-tight" style={{ fontFamily: "'Darker Grotesque', sans-serif" }}>
              {branding.displayName} <span className="text-primary">{branding.aiSuffix}<sup className="text-xs align-super ml-0.5">™</sup></span>
            </h1>
            <span className="px-2 py-1 text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-md border border-amber-500/30 animate-pulse">
              Beta
            </span>
          </div>
          <p className="text-xl md:text-2xl font-medium text-muted-foreground mt-3">
            Differentiation, built into every sheet.
          </p>
          <p className="text-muted-foreground mt-2">
            {branding.tagline}
          </p>
          <p className="text-sm text-muted-foreground/80 mt-1 italic">
            {branding.secondaryTagline}
          </p>
        </div>

        {/* Auth error banner (e.g., student trying to access teacher portal) */}
        {authError && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">Access Denied</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{authError}</p>
                <Link
                  to="/student/login"
                  className="inline-block mt-2 text-sm font-medium text-red-700 dark:text-red-300 hover:underline"
                  onClick={clearAuthError}
                >
                  Go to Student Portal →
                </Link>
              </div>
              <button
                onClick={clearAuthError}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
              >
                <span className="sr-only">Dismiss</span>
                ×
              </button>
            </div>
          </div>
        )}

        <Card className="shadow-lg border-border/50 backdrop-blur-sm">
          <Tabs defaultValue="login" className="w-full">
            <CardHeader className="pb-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Create Account</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="pt-6">
              {/* Login Tab */}
              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="teacher@school.edu"
                        className={`pl-10 ${loginEmailError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                        value={loginEmail}
                        onChange={(e) => {
                          setLoginEmail(e.target.value);
                          if (loginEmailError) setLoginEmailError('');
                        }}
                        onBlur={handleLoginEmailBlur}
                        disabled={isLoading}
                        required
                        autoComplete="email"
                      />
                    </div>
                    {loginEmailError && (
                      <p className="text-xs text-red-500 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="h-3 w-3" />
                        {loginEmailError}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        disabled={isLoading}
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                        disabled={isLoading}
                      />
                      <label
                        htmlFor="remember-me"
                        className="text-sm text-muted-foreground cursor-pointer select-none"
                      >
                        Remember me
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setForgotEmail(loginEmail);
                        setForgotEmailSent(false);
                      }}
                      className="text-sm text-primary hover:underline focus:outline-none focus:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Button type="submit" className="w-full" variant="hero" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                    
                    {showRetry && isLoading && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full animate-in fade-in slide-in-from-bottom-2"
                        onClick={handleRetry}
                      >
                        Taking too long? Click to retry
                      </Button>
                    )}
                  </div>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isLoading}
                    onClick={async () => {
                      setIsLoading(true);
                      const { error } = await supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                          redirectTo: `${window.location.origin}/dashboard`,
                        },
                      });
                      if (error) {
                        toast({
                          title: "Google sign-in failed",
                          description: error.message,
                          variant: "destructive",
                        });
                        setIsLoading(false);
                      }
                    }}
                  >
                    <Chrome className="mr-2 h-4 w-4" />
                    Sign in with Google
                  </Button>

                  {/* Demo Access Section */}
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground flex items-center gap-1">
                        <Play className="h-3 w-3" />
                        Try Demo
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-col h-auto py-3 border-dashed hover:border-primary hover:bg-primary/5"
                      disabled={isLoading || demoLoading !== null}
                      onClick={() => handleDemoLogin('teacher')}
                    >
                      {demoLoading === 'teacher' ? (
                        <Loader2 className="h-5 w-5 animate-spin mb-1" />
                      ) : (
                        <GraduationCap className="h-5 w-5 mb-1 text-primary" />
                      )}
                      <span className="text-xs font-medium">Teacher Demo</span>
                      <span className="text-[10px] text-muted-foreground">Classroom features</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-col h-auto py-3 border-dashed hover:border-primary hover:bg-primary/5"
                      disabled={isLoading || demoLoading !== null}
                      onClick={() => handleDemoLogin('admin')}
                    >
                      {demoLoading === 'admin' ? (
                        <Loader2 className="h-5 w-5 animate-spin mb-1" />
                      ) : (
                        <Shield className="h-5 w-5 mb-1 text-amber-500" />
                      )}
                      <span className="text-xs font-medium">Admin Demo</span>
                      <span className="text-[10px] text-muted-foreground">Full system access</span>
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* Signup Tab */}
              <TabsContent value="signup" className="mt-0">
                {signupEmailSent ? (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="text-lg font-semibold">Check Your Email</h3>
                    <p className="text-center text-sm text-muted-foreground">
                      We've sent a verification link to <strong>{signupEmail}</strong>.
                      Please click the link in the email to verify your account.
                    </p>
                    <p className="text-center text-xs text-muted-foreground">
                      Don't see it? Check your spam folder.
                    </p>
                    <Button
                      onClick={() => {
                        setSignupEmailSent(false);
                        setSignupEmail('');
                        setSignupPassword('');
                        setSignupConfirmPassword('');
                        setSignupName('');
                        setSignupEmailTouched(false);
                        setSignupPasswordTouched(false);
                      }}
                      variant="outline"
                      className="mt-2"
                    >
                      Back to Sign Up
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSignup} className="space-y-4">
                    {/* Full Name */}
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-name"
                          type="text"
                          placeholder="Jane Smith"
                          className="pl-10"
                          value={signupName}
                          onChange={(e) => setSignupName(e.target.value)}
                          disabled={isLoading}
                          required
                          autoComplete="name"
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">School Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="teacher@school.edu"
                          className={`pl-10 ${signupEmailError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                          value={signupEmail}
                          onChange={(e) => {
                            setSignupEmail(e.target.value);
                            if (signupEmailError) setSignupEmailError('');
                          }}
                          onBlur={handleSignupEmailBlur}
                          disabled={isLoading}
                          required
                          autoComplete="email"
                        />
                      </div>
                      {signupEmailError && (
                        <p className="text-xs text-red-500 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                          <AlertCircle className="h-3 w-3" />
                          {signupEmailError}
                        </p>
                      )}
                    </div>

                    {/* Password */}
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="pl-10 pr-10"
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          onFocus={() => setSignupPasswordTouched(true)}
                          disabled={isLoading}
                          required
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>

                      {/* Password Strength Indicator */}
                      {signupPasswordTouched && signupPassword && (
                        <PasswordStrengthIndicator
                          password={signupPassword}
                          showRequirements={true}
                        />
                      )}
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className={`pl-10 pr-10 ${confirmPasswordError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                          value={signupConfirmPassword}
                          onChange={(e) => setSignupConfirmPassword(e.target.value)}
                          disabled={isLoading}
                          required
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {confirmPasswordError && (
                        <p className="text-xs text-red-500 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                          <AlertCircle className="h-3 w-3" />
                          Passwords don't match
                        </p>
                      )}
                      {signupConfirmPassword && passwordsMatch && (
                        <p className="text-xs text-green-500 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
                          <CheckCircle className="h-3 w-3" />
                          Passwords match
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      variant="hero"
                      disabled={isLoading || !canSubmitSignup}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>

                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={isLoading}
                      onClick={async () => {
                        setIsLoading(true);
                        const { error } = await supabase.auth.signInWithOAuth({
                          provider: 'google',
                          options: {
                            redirectTo: `${window.location.origin}/dashboard`,
                          },
                        });
                        if (error) {
                          toast({
                            title: "Google sign-up failed",
                            description: error.message,
                            variant: "destructive",
                          });
                          setIsLoading(false);
                        }
                      }}
                    >
                      <Chrome className="mr-2 h-4 w-4" />
                      Sign up with Google
                    </Button>
                  </form>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <div className="text-center mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you a student?{" "}
            <Link to="/student/login" className="text-primary font-medium hover:underline">
              Student Portal →
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>.
            <br />
            Student data is handled in accordance with FERPA guidelines.
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md shadow-lg animate-fade-in">
            <CardHeader>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowForgotPassword(false)}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <CardTitle>Reset Password</CardTitle>
                  <CardDescription>
                    {forgotEmailSent
                      ? "Check your email for the reset link"
                      : "Enter your email to receive a reset link"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {forgotEmailSent ? (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    We've sent a password reset link to <strong>{forgotEmail}</strong>.
                    Please check your inbox and spam folder.
                  </p>
                  <Button
                    onClick={() => setShowForgotPassword(false)}
                    variant="outline"
                    className="mt-2"
                  >
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="teacher@school.edu"
                        className="pl-10"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        disabled={isLoading}
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowForgotPassword(false)}
                      className="flex-1"
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" variant="hero" disabled={isLoading} className="flex-1">
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Send Reset Link"
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Powered by badge - shown when using custom school branding */}
      <PoweredByBadge className="mt-8 mb-4" />
      
      {/* Change school link */}
      <div className="text-center mt-2">
        <Link 
          to="/select-school" 
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
          onClick={() => {
            // Clear stored preference so they can pick again
            localStorage.removeItem('selected_school_branding');
            localStorage.removeItem('school_selector_seen');
          }}
        >
          Switch School / View All Sites
        </Link>
      </div>
    </div>
  );
}
