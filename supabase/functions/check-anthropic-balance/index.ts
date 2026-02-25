// Edge Function: check-anthropic-balance
// Monitors Anthropic API balance and sends alert when below threshold

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL') || 'pilowgems@gmail.com'
const BALANCE_THRESHOLD = 5.00 // Alert when balance drops below $5

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

interface AnthropicBalanceResponse {
  balance: {
    amount: number
    currency: string
  }
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

async function checkAnthropicBalance(): Promise<AnthropicBalanceResponse> {
  // Note: Anthropic API doesn't have a public balance endpoint yet
  // This is a placeholder for when they add it, or we can track via usage
  
  // Alternative: Check organization usage/credits via their API
  // For now, we'll use a workaround: Check via Anthropic dashboard API if available
  
  const response = await fetch('https://api.anthropic.com/v1/organization/balance', {
    method: 'GET',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} - ${await response.text()}`)
  }

  return await response.json()
}

async function sendBalanceAlert(balance: number, currency: string) {
  const emailPayload = {
    sender: {
      name: "Clawdbot Alerts",
      email: "no-reply@nyclogicai.com"
    },
    to: [{
      email: ALERT_EMAIL,
      name: "Gregory Francois"
    }],
    
    subject: `⚠️ Anthropic API Balance Low: $${balance.toFixed(2)}`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 8px;">
          <h2 style="color: #991b1b; margin-top: 0;">⚠️ Low API Balance Alert</h2>
          <p style="color: #7f1d1d; font-size: 16px;">
            Your Anthropic API balance has dropped below the threshold.
          </p>
        </div>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Current Balance</h3>
          <p style="font-size: 32px; font-weight: bold; color: #dc2626; margin: 8px 0;">
            $${balance.toFixed(2)} ${currency}
          </p>
          <p style="color: #6b7280; margin: 8px 0;">
            Alert threshold: $${BALANCE_THRESHOLD.toFixed(2)}
          </p>
        </div>
        
        <div style="background: #fffbeb; border: 1px solid #fbbf24; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #78350f;">
            <strong>⚡ Action Required:</strong> Add funds to your Anthropic account to avoid service interruption.
          </p>
        </div>
        
        <p>
          <a href="https://console.anthropic.com/settings/billing" 
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
            Add Funds to Anthropic Account
          </a>
        </p>
        
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px; margin: 4px 0;">
            <strong>Checked:</strong> ${new Date().toLocaleString('en-US', { 
              timeZone: 'America/New_York',
              dateStyle: 'full',
              timeStyle: 'short'
            })}
          </p>
          <p style="color: #6b7280; font-size: 14px; margin: 4px 0;">
            This check runs automatically every 24 hours.
          </p>
        </div>
        
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          Automated alert from Clawdbot monitoring system
        </p>
      </div>
    `
  }

  const brevoResponse = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_API_KEY!,
      'content-type': 'application/json'
    },
    body: JSON.stringify(emailPayload)
  })

  if (!brevoResponse.ok) {
    const errorText = await brevoResponse.text()
    throw new Error(`Brevo API error: ${brevoResponse.status} - ${errorText}`)
  }

  return await brevoResponse.json()
}

serve(async (req) => {
  try {
    console.log('🔍 Checking Anthropic API balance...')
    
    // Check balance
    let balanceData: AnthropicBalanceResponse
    
    try {
      balanceData = await checkAnthropicBalance()
    } catch (error) {
      // If the balance endpoint doesn't exist yet, we can track manually
      // or integrate with OpenRouter/other monitoring tools
      console.error('Unable to check Anthropic balance:', (error as Error).message)
      
      return new Response(JSON.stringify({ 
        error: 'Balance check not available',
        message: 'Anthropic API does not expose balance endpoint yet. Consider using OpenRouter or manual tracking.',
        suggestion: 'Check console.anthropic.com/settings/billing manually'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503
      })
    }

    const balance = balanceData.balance.amount
    const currency = balanceData.balance.currency
    
    console.log(`💰 Current balance: ${balance} ${currency}`)

    // Check if below threshold
    if (balance < BALANCE_THRESHOLD) {
      console.log(`⚠️ Balance below threshold! Sending alert...`)
      
      await sendBalanceAlert(balance, currency)
      
      return new Response(JSON.stringify({
        status: 'alert_sent',
        balance,
        currency,
        threshold: BALANCE_THRESHOLD,
        message: `Alert sent to ${ALERT_EMAIL}`
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    } else {
      console.log(`✅ Balance OK (${balance} >= ${BALANCE_THRESHOLD})`)
      
      return new Response(JSON.stringify({
        status: 'ok',
        balance,
        currency,
        threshold: BALANCE_THRESHOLD,
        message: 'Balance is above threshold'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

  } catch (error) {
    console.error('❌ Error checking balance:', error)
    
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
