from scipy.optimize import curve_fit
from ..emodel_base import EmodelBase
import numpy as np


class LineMaxModel(EmodelBase):
    NAME = "LineMax"
    DESCRIPTION = "Evaluate the average over a range and the maximum"
    DOI = ""
    PARAMETERS = {"E [Pa]": "Average modulus", "M<E> [Pa]": "Median modulus", "Emax [Pa]": "Max modulus", "Emin": "Min modulus"}

    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("Smooth", "int", "Upper Percentile threshold", 100, options={"min": 60, "max": 100})
        self.add_parameter("Lower", "int", "Lower Percentile threshold", 10, options={"min": 5, "max": 50})

    def theory(self, x, *parameters):
        """
        Constant model: E * ones(len(x))
        :param x: Input array (e.g., indentation depth)
        :param parameters: [E] (average modulus)
        :return: Constant array of average modulus
        """
        return parameters[0] * np.ones(len(x))

    def calculate(self, x, y):
        """
        Calculate average, median, max, and min modulus from curve data.
        :param x: Indentation depth (m, DOUBLE[])
        :param y: Force values (N, DOUBLE[])
        :return: Parameters [avg, median, max, min] or None if error occurs
        """
        # if self.curve is None or "_E" not in self.curve:
        #     return None

        full = np.asarray(y, dtype=np.float64)  # Modulus data from curve
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        if len(full) < 2 or len(y) < 2:
            return None

        percentile = self.get_value('Smooth')  # Upper percentile
        lower = self.get_value('Lower')        # Lower percentile

        if percentile < 100:
            threshold = np.percentile(full, percentile)
            maxi = np.average(full[full > threshold])
        else:
            maxi = np.max(full)
        
        min_th = np.percentile(full, lower)
        mini = np.average(full[full < min_th])

        # Compute statistical parameters
        stats = [float(np.average(y)), float(np.median(full)), float(maxi), float(mini)]
        # print("stats", stats)

        # Use the average (stats[0]) to compute y_fit with theory
        y_fit = self.theory(x, stats[0])  # Only pass the average modulus
        return [x.tolist(), y_fit.tolist()]