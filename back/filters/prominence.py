import numpy as np
from scipy.signal import find_peaks
from scipy.interpolate import interp1d

def prominence_filter(x, y, prominence=40, threshold=25, band=30):
    """
    Filters prominent peaks in the Fourier space to eliminate oscillations.

    :param x: List or NumPy array of x-axis values
    :param y: List or NumPy array of y-axis values
    :param prominence: Peak prominence threshold (default=40)
    :param threshold: Minimum frequency to filter (default=25)
    :param band: Bandwidth percentage around peaks for filtering (default=30%)
    :return: Filtered y-values (inverse FFT)
    """
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)

    if len(x) == 0 or len(y) == 0:
        return y  # ✅ Return original if empty

    # ✅ Compute FFT of the signal
    ff = np.fft.rfft(y, norm=None)

    # ✅ Identify peaks in log(abs(FFT))
    peak_indices, _ = find_peaks(np.log(np.abs(ff)), prominence=prominence)

    # ✅ Create a mask to keep valid frequencies
    xgood = np.ones(len(ff.real), dtype=bool)

    for peak in peak_indices:
        jwin = int(peak * band / 100)  # Bandwidth in percentage
        if peak > threshold:
            ext1 = max(peak - jwin, 0)
            ext2 = min(peak + jwin + 1, len(xgood) - 1)
            xgood[ext1:ext2] = False  # Zero out bad frequencies

    # ✅ Ensure at least 50 frequencies remain
    if np.sum(xgood) < 50:
        return y

    # ✅ Interpolate missing values in Fourier space
    xf = np.arange(len(ff.real))
    real_interp = interp1d(xf[xgood], ff.real[xgood], kind='linear', fill_value="extrapolate")
    imag_interp = interp1d(xf[xgood], ff.imag[xgood], kind='linear', fill_value="extrapolate")

    ff.real = real_interp(xf)
    ff.imag = imag_interp(xf)

    # ✅ Compute inverse FFT to get filtered signal
    return np.fft.irfft(ff, n=len(y)).tolist()  # ✅ Ensure returning list
