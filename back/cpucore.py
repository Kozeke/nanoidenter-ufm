import os
import multiprocessing

# Number of logical CPU cores
print("Logical cores:", os.cpu_count())

# Number of physical CPU cores
print("Physical cores:", multiprocessing.cpu_count())
