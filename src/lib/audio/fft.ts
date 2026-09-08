/**
 * A radix-2 FFT and the autocorrelation built on it, hand-rolled so the app
 * keeps its zero-runtime-dependency promise. Pure functions over numbers: no
 * DOM, no Web Audio, nothing to mock.
 *
 * This exists for one caller — `detectPitch`, which needs every lag of a
 * frame's autocorrelation at once. Summing each lag directly costs one
 * multiply-add per sample per lag, which for a 2048-sample frame at 48 kHz is
 * over a million of them on the main thread every 50 ms poll. Wiener-Khinchin
 * gets the whole set for the price of two transforms instead: the
 * autocorrelation of a signal is the inverse transform of its power spectrum.
 */

/** Twiddle factors are the same every frame, so they are computed once a size. */
const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array }>()

/**
 * exp(-2πi·j/size) for j in 0..size/2-1. Every butterfly pass strides into this
 * one table rather than stepping a rotation forward multiplication by
 * multiplication, so a long pass cannot drift off the unit circle.
 */
const twiddles = (size: number) => {
  const cached = twiddleCache.get(size)
  if (cached) {
    return cached
  }

  const half = size >> 1
  const cos = new Float64Array(half)
  const sin = new Float64Array(half)
  for (let index = 0; index < half; index += 1) {
    const angle = (-2 * Math.PI * index) / size
    cos[index] = Math.cos(angle)
    sin[index] = Math.sin(angle)
  }

  const table = { cos, sin }
  twiddleCache.set(size, table)
  return table
}

/**
 * The forward DFT of `re + i·im`, in place, for a power-of-two length.
 *
 * Iterative Cooley-Tukey: the bit-reversal permutation first, so that the
 * passes after it combine neighbours, then log2(n) passes of butterflies over
 * blocks that double in width.
 */
export const fftInPlace = (re: Float64Array, im: Float64Array): void => {
  const size = re.length
  if (im.length !== size) {
    throw new Error('fftInPlace: the real and imaginary parts must be the same length')
  }

  if (size < 1 || (size & (size - 1)) !== 0) {
    throw new Error(`fftInPlace: length must be a power of two, got ${size}`)
  }

  if (size === 1) {
    return
  }

  // Bit-reversal permutation, counted rather than recomputed: `to` is `from`
  // with its bits reversed, carried forward one increment at a time.
  for (let from = 1, to = 0; from < size; from += 1) {
    let bit = size >> 1
    for (; to & bit; bit >>= 1) {
      to ^= bit
    }

    to |= bit

    if (from < to) {
      const swapRe = re[from]
      re[from] = re[to]
      re[to] = swapRe
      const swapIm = im[from]
      im[from] = im[to]
      im[to] = swapIm
    }
  }

  const { cos, sin } = twiddles(size)

  for (let width = 2; width <= size; width <<= 1) {
    const half = width >> 1
    // Only every `stride`-th twiddle belongs to a pass this wide.
    const stride = size / width

    for (let start = 0; start < size; start += width) {
      for (let index = 0; index < half; index += 1) {
        const twiddle = index * stride
        const factorRe = cos[twiddle]
        const factorIm = sin[twiddle]

        const low = start + index
        const high = low + half
        const productRe = re[high] * factorRe - im[high] * factorIm
        const productIm = re[high] * factorIm + im[high] * factorRe

        re[high] = re[low] - productRe
        im[high] = im[low] - productIm
        re[low] += productRe
        im[low] += productIm
      }
    }
  }
}

const nextPowerOfTwo = (value: number) => {
  let size = 1
  while (size < value) {
    size <<= 1
  }

  return size
}

/**
 * The frame's autocorrelation at every lag from 0 to `maxLag`, where
 * `result[lag]` is `Σ frame[i]·frame[i+lag]` over the samples both indices
 * exist for — exactly what a direct double loop would add up, to within float
 * rounding.
 *
 * The transform's correlation is circular: without room to spare, energy from
 * the end of the frame would wrap around and land on the long lags. Padding to
 * a power of two at least `length + maxLag + 1` long is what leaves that room,
 * so every lag actually read back is the linear correlation.
 *
 * The second transform is a forward one, not an inverse: a power spectrum is
 * real and even, so its forward transform is its inverse scaled by the
 * transform length, and dividing that back out is the whole difference.
 */
export const autocorrelate = (frame: Float32Array, maxLag: number): Float64Array => {
  const size = nextPowerOfTwo(frame.length + maxLag + 1)
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  re.set(frame)

  fftInPlace(re, im)

  for (let bin = 0; bin < size; bin += 1) {
    re[bin] = re[bin] * re[bin] + im[bin] * im[bin]
    im[bin] = 0
  }

  fftInPlace(re, im)

  const correlation = new Float64Array(maxLag + 1)
  for (let lag = 0; lag <= maxLag; lag += 1) {
    correlation[lag] = re[lag] / size
  }

  return correlation
}
