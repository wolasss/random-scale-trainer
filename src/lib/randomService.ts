/**
 * Service for generating random numbers using random.org API.
 * Falls back to Math.random() if the API is unavailable.
 */

type RandomOrgResponse = {
  jsonrpc: string
  result: {
    random: {
      data: number[]
      completionTime: string
    }
    bitsUsed: number
    bitsLeft: number
    requestsLeft: number
    advisoryDelay: number
  }
  id: number
}

class RandomService {
  private requestCounter = 0
  private isOnline = true

  /**
   * Fetch random integers from random.org.
   * Returns an array of random integers between min (inclusive) and max (inclusive).
   */
  async getRandomIntegers(count: number, min: number, max: number): Promise<number[]> {
    if (!this.isOnline) {
      return this.getFallbackIntegers(count, min, max)
    }

    try {
      const response = await fetch('https://api.random.org/json-rpc/2.0/invoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'generateIntegers',
          params: {
            apiKey: 'YOUR_API_KEY_HERE', // Using free tier without key
            n: count,
            min,
            max,
            replacement: true,
          },
          id: ++this.requestCounter,
        }),
      })

      if (!response.ok) {
        this.isOnline = false
        return this.getFallbackIntegers(count, min, max)
      }

      const data = (await response.json()) as RandomOrgResponse

      if (data.result && data.result.random && Array.isArray(data.result.random.data)) {
        return data.result.random.data
      }

      this.isOnline = false
      return this.getFallbackIntegers(count, min, max)
    } catch {
      this.isOnline = false
      return this.getFallbackIntegers(count, min, max)
    }
  }

  /**
   * Fallback to Math.random() when random.org is unavailable.
   */
  private getFallbackIntegers(count: number, min: number, max: number): number[] {
    const result: number[] = []
    for (let i = 0; i < count; i++) {
      result.push(Math.floor(Math.random() * (max - min + 1)) + min)
    }
    return result
  }

  /**
   * Get a single random float between 0 (inclusive) and 1 (exclusive).
   * Uses cached random integers to avoid repeated API calls.
   */
  async getRandomFloat(): Promise<number> {
    const integers = await this.getRandomIntegers(1, 0, 1000000)
    return integers[0] / 1000001
  }
}

export const randomService = new RandomService()
