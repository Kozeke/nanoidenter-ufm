from filters.apply_contact_point_filters import apply_cp_filters 

def apply(query, filters, curve_ids):
    """
    Applies selected filters dynamically to the base query.
    - filters: Dictionary of filters with parameters.
    - curve_ids: Number of curves to fetch.
    
    Example filters:
        filters = {
            "median": {"window_size": 5},
            "lineardetrend": {"smoothing_window": 10, "threshold": 0.01},
            "savgol": {"window_size": 25, "polyorder": 3}
        }
    """
    cp_filters = filters.get("cp_filters", {})
    filters = filters.get("regular", {})

    filter_chain = "force_values"  # ✅ Start with raw force values

    # ✅ Median Filter
    if "median" in filters:
        window_size = filters["median"].get("window_size", 5)
        filter_chain = f"median_filter_array({filter_chain}, {window_size})"

    # ✅ Linear Detrend Filter
    if "lineardetrend" in filters:
        threshold = filters["lineardetrend"].get("threshold", 0.01)
        smoothing_window = filters["lineardetrend"].get("smoothing_window", 10)
        filter_chain = f"linear_detrend(z_values, {filter_chain}, {smoothing_window}, {threshold})"

    # ✅ Notch Filter
    if "notch" in filters:
        period_nm = filters["notch"].get("period_nm", 100.0)
        quality_factor = filters["notch"].get("quality_factor", 10)
        filter_chain = f"notch_filter(z_values, {filter_chain}, {period_nm}, {quality_factor})"

    # ✅ Polynomial Baseline Correction (Polytrend)
    if "polytrend" in filters:
        percentile = filters["polytrend"].get("percentile", 90)
        degree = filters["polytrend"].get("degree", 3)
        filter_chain = f"polytrend_filter(z_values, {filter_chain}, {percentile}, {degree})"

    # ✅ Prominence Filter
    if "prominence" in filters:
        prominence = filters["prominence"].get("prominence", 40)
        threshold = filters["prominence"].get("threshold", 25)
        band = filters["prominence"].get("band", 30)
        filter_chain = f"prominence_filter(z_values, {filter_chain}, {prominence}, {threshold}, {band})"

    # ✅ Savitzky-Golay (SavGol) Filter
    if "savgol" in filters:
        window_size = filters["savgol"].get("window_size", 25.0)
        polyorder = filters["savgol"].get("polyorder", 3)
        filter_chain = f"savgol_smooth(z_values, {filter_chain}, {window_size}, {polyorder})"

    
    
    query = f"""
        SELECT curve_name, 
                z_values, 
                {filter_chain} AS force_values
        FROM force_vs_z 
        WHERE curve_id IN ({",".join([f"'{cid}'" for cid in curve_ids])})
    """
    
    if cp_filters:
        query = apply_cp_filters(query, cp_filters, curve_ids)

    # print(query)  # ✅ Debugging: Check the generated SQL
    return query
