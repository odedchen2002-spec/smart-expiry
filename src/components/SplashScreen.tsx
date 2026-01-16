/**
 * Splash Screen Component
 * Fast loading screen with static logo - optimized for quick startup
 * Used across all loading states for a unified, polished experience
 * 
 * PERFORMANCE: Animations shortened from 600-800ms to 150-200ms
 * No continuous animations that block rendering
 */

import { useLanguage } from '@/context/LanguageContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';

// Animation constants - OPTIMIZED for fast startup
const ANIMATION = {
  LOGO_FADE_DURATION: 150,    // Was 600ms - reduced by 450ms
  LOGO_SCALE_DURATION: 200,   // Was 800ms - reduced by 600ms
  TEXT_FADE_DURATION: 100,    // Was 400ms - reduced by 300ms
  // Removed: PULSE_DURATION, SHIMMER_DURATION (continuous animations removed)
};

// Easing for smooth, premium feel
const EASE_OUT = Easing.bezier(0.25, 0.1, 0.25, 1);

export function SplashScreen() {
  // Get language for tagline - use try-catch in case context not available
  let taglineText = 'ניהול תוקף חכם'; // Hebrew default
  try {
    const { locale } = useLanguage();
    taglineText = locale === 'en' ? 'Smart Expiry Management' : 'ניהול תוקף חכם';
  } catch {
    // Context not available, use default
  }

  // Animation values - start with visible values to reduce perceived delay
  const logoOpacity = useRef(new Animated.Value(0.7)).current; // Start at 70% visible
  const logoScale = useRef(new Animated.Value(0.95)).current;  // Start almost full size
  const textOpacity = useRef(new Animated.Value(0.5)).current; // Start partially visible

  useEffect(() => {
    // Quick entrance animation - all elements animate together for speed
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: ANIMATION.LOGO_FADE_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: ANIMATION.LOGO_SCALE_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: ANIMATION.TEXT_FADE_DURATION,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();

    // No continuous animations - they're not seen anyway since splash disappears quickly
  }, [logoOpacity, logoScale, textOpacity]);

  return (
    <View style={styles.container}>
      {/* Gradient background */}
      <LinearGradient
        colors={['#1C7EF6', '#1060F4']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative circles */}
      <View style={styles.decorativeCircle1} />
      <View style={styles.decorativeCircle2} />

      {/* Logo container with glow effect */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        {/* Glow effect behind logo */}
        <View style={styles.logoGlow} />
        
        {/* Logo */}
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* App name */}
      <Animated.View style={[styles.textContainer, { opacity: textOpacity }]}>
        <Text style={styles.appName}>Smart Expiry</Text>
        <Text style={styles.tagline}>{taglineText}</Text>
      </Animated.View>

      {/* Loading indicator dots */}
      <Animated.View style={[styles.loadingContainer, { opacity: textOpacity }]}>
        <LoadingDots />
      </Animated.View>
    </View>
  );
}

// Static loading dots - no animation overhead for fast splash
function LoadingDots() {
  return (
    <View style={styles.dotsContainer}>
      <View style={[styles.dot, { opacity: 0.6 }]} />
      <View style={[styles.dot, { opacity: 0.8 }]} />
      <View style={[styles.dot, { opacity: 1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C7EF6',
  },
  
  // Decorative background elements
  decorativeCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // Logo styling
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 30,
      },
      android: {
        elevation: 0, // Android doesn't support colored shadows well
      },
    }),
  },
  logo: {
    width: 140,
    height: 140,
  },

  // Text styling
  textContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 0.3,
  },

  // Loading indicator
  loadingContainer: {
    position: 'absolute',
    bottom: 80,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
});
