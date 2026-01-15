/**
 * Production Diagnostics
 * Helps diagnose network/configuration issues in production builds
 */

import { supabase } from '../supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/config';

export interface DiagnosticResult {
  success: boolean;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    details?: any;
  }[];
  summary: string;
}

/**
 * Run comprehensive production diagnostics
 * Safe to call on app startup or when debugging network issues
 */
export async function runProductionDiagnostics(): Promise<DiagnosticResult> {
  const checks: DiagnosticResult['checks'] = [];
  let allPass = true;

  // Check 1: Environment variables present
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    checks.push({
      name: 'Environment Variables',
      status: 'pass',
      message: 'Supabase URL and Key are configured',
      details: {
        url: `${SUPABASE_URL.substring(0, 40)}...`,
        keyLength: SUPABASE_ANON_KEY.length,
      },
    });
  } else {
    checks.push({
      name: 'Environment Variables',
      status: 'fail',
      message: 'Missing Supabase configuration',
      details: {
        SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
      },
    });
    allPass = false;
  }

  // Check 2: URL is HTTPS
  if (SUPABASE_URL) {
    if (SUPABASE_URL.startsWith('https://')) {
      checks.push({
        name: 'HTTPS Protocol',
        status: 'pass',
        message: 'Supabase URL uses HTTPS',
      });
    } else {
      checks.push({
        name: 'HTTPS Protocol',
        status: 'fail',
        message: `Supabase URL does not use HTTPS: ${SUPABASE_URL}`,
      });
      allPass = false;
    }
  }

  // Check 3: URL is not localhost
  if (SUPABASE_URL) {
    if (SUPABASE_URL.includes('localhost') || SUPABASE_URL.includes('127.0.0.1')) {
      checks.push({
        name: 'Production URL',
        status: 'fail',
        message: 'Supabase URL points to localhost (not accessible in production)',
      });
      allPass = false;
    } else {
      checks.push({
        name: 'Production URL',
        status: 'pass',
        message: 'Supabase URL is not localhost',
      });
    }
  }

  // Check 4: Supabase connectivity (simple query)
  try {
    const startTime = Date.now();
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .maybeSingle();
    
    const duration = Date.now() - startTime;

    if (error) {
      checks.push({
        name: 'Supabase Connectivity',
        status: 'fail',
        message: 'Failed to connect to Supabase',
        details: {
          error: error.message,
          code: (error as any).code,
          duration: `${duration}ms`,
        },
      });
      allPass = false;
    } else {
      checks.push({
        name: 'Supabase Connectivity',
        status: 'pass',
        message: 'Successfully connected to Supabase',
        details: { duration: `${duration}ms` },
      });
    }
  } catch (error: any) {
    checks.push({
      name: 'Supabase Connectivity',
      status: 'fail',
      message: 'Network request failed',
      details: {
        error: error?.message || String(error),
        type: error?.name,
      },
    });
    allPass = false;
  }

  // Check 5: Auth service health
  try {
    const startTime = Date.now();
    const { data, error } = await supabase.auth.getSession();
    const duration = Date.now() - startTime;

    if (error) {
      checks.push({
        name: 'Auth Service',
        status: 'warn',
        message: 'Auth service error (might be normal if not logged in)',
        details: {
          error: error.message,
          duration: `${duration}ms`,
        },
      });
    } else {
      checks.push({
        name: 'Auth Service',
        status: 'pass',
        message: 'Auth service accessible',
        details: {
          hasSession: !!data.session,
          duration: `${duration}ms`,
        },
      });
    }
  } catch (error: any) {
    checks.push({
      name: 'Auth Service',
      status: 'fail',
      message: 'Auth service unreachable',
      details: {
        error: error?.message || String(error),
      },
    });
    allPass = false;
  }

  const summary = allPass
    ? '✅ All diagnostics passed'
    : '❌ Some diagnostics failed - check details';

  return {
    success: allPass,
    checks,
    summary,
  };
}

/**
 * Format diagnostic results for display or logging
 */
export function formatDiagnosticResults(result: DiagnosticResult): string {
  let output = `\n${'='.repeat(60)}\n`;
  output += `PRODUCTION DIAGNOSTICS\n`;
  output += `${'='.repeat(60)}\n\n`;

  result.checks.forEach((check) => {
    const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
    output += `${icon} ${check.name}: ${check.message}\n`;
    if (check.details) {
      output += `   Details: ${JSON.stringify(check.details, null, 2)}\n`;
    }
    output += '\n';
  });

  output += `${'='.repeat(60)}\n`;
  output += `${result.summary}\n`;
  output += `${'='.repeat(60)}\n`;

  return output;
}
