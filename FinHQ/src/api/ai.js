export async function predictCategory(merchant, amount, categories, apiKey) {
  if (!apiKey || !merchant || merchant.length < 3) return null

  const categoryNames = categories
    .filter((c) => c.type === 'expense')
    .map((c) => c.name)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `You are a personal finance categorisation engine.

Given this transaction, predict the most likely category.

Merchant: ${merchant}
Amount: ${amount}
User's categories: ${categoryNames.join(', ')}

Respond with ONLY valid JSON in this exact format:
{"category": "<exact category name from the list>", "confidence": <0.0 to 1.0>}

If none fit, use the closest one. Never invent a category not in the list.`,
          },
        ],
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return parsed
  } catch {
    return null
  }
}

export async function parseSmsText(smsText, apiKey) {
  if (!apiKey || !smsText) return null

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `Parse this Indian bank SMS and extract transaction details.

SMS: ${smsText}

Respond with ONLY valid JSON:
{
  "title": "<merchant or description>",
  "amount": <number>,
  "direction": "<debit or credit>",
  "account_hint": "<last 4 digits if found, else null>",
  "txn_date": "<YYYY-MM-DD or today's date>",
  "predicted_category": "<one of: Groceries, Dining Out, Transport, Fuel, Auto/Cab, Rent, Electricity, Shopping, Entertainment, Medicines, Salary, Freelance Income, Other Expenses>"
}`,
          },
        ],
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}
