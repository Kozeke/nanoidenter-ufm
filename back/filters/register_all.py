import duckdb
from filters.calculate_indentation import calc_indentation
from filters.calculate_elasticity import calc_elspectra

# from filters.fmodels.hertz import calc_fmodels
# from filters.emodels.calc_emodels import calc_emodels

from filters.filters.filter_registry import register_filter, create_udf, save_filter_to_db
from filters.cpoints.cp_registry import register_contact_point_filter, create_contact_point_udf, save_cp_to_db
from filters.fmodels.fmodel_registry import register_fmodel, create_fmodel_udf, save_fmodel_to_db
from filters.emodels.emodel_registry import register_emodel, create_emodel_udf, save_emodel_to_db

from pathlib import Path
from filters.load_classes import load_filter_classes


def register_filters(conn):
    """Registers all filter functions inside DuckDB for SQL queries."""
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS filters (
            name VARCHAR PRIMARY KEY,
            description VARCHAR,
            doi VARCHAR,
            parameters JSON
        )
    """)
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cps (
            name VARCHAR PRIMARY KEY,
            description VARCHAR,
            doi VARCHAR,
            parameters JSON
        )
    """)
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fmodels (
            name VARCHAR PRIMARY KEY,
            description VARCHAR,
            doi VARCHAR,
            parameters JSON
        )
    """)
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS emodels (
            name VARCHAR PRIMARY KEY,
            description VARCHAR,
            doi VARCHAR,
            parameters JSON
        )
    """)

    filters_dir = Path("filters/filters/import_filters")
    cpoints_dir = Path("filters/cpoints/import_cpoints")  # Now a sibling directory, not nested
    fmodels_dir = Path("filters/fmodels/import_fmodels")
    emodels_dir = Path("filters/emodels/import_emodels")  # New directory for emodels

    # Load filter classes dynamically
    filter_classes = load_filter_classes(filters_dir, "filters.filters.import_filters")
    contact_point_filter_classes = load_filter_classes(cpoints_dir, "filters.cpoints.import_cpoints")
    fmodel_classes = load_filter_classes(fmodels_dir, "filters.fmodels.import_fmodels")
    emodel_classes = load_filter_classes(emodels_dir, "filters.emodels.import_emodels")  # Load emodel classes

    print("registration contact_point_filter_classes", contact_point_filter_classes)
    # Register and create UDFs for contact point filters
    for filter_class in contact_point_filter_classes:
        register_contact_point_filter(filter_class)
        save_cp_to_db(filter_class, conn)  # Save to DB
        create_contact_point_udf(filter_class.NAME, conn)
    
    # Register and create UDFs for all other filters
    for filter_class in filter_classes:
        register_filter(filter_class)
        save_filter_to_db(filter_class, conn)  # Save to DB
        create_udf(filter_class.NAME, conn)
    
    # Register and create UDFs for fmodels
    for fmodel_class in fmodel_classes:
        register_fmodel(fmodel_class)
        save_fmodel_to_db(fmodel_class, conn)
        create_fmodel_udf(fmodel_class.NAME, conn)
    
    # Register and create UDFs for emodels
    print("Loading emodel classes:", emodel_classes)
    for emodel_class in emodel_classes:
        print(f"Registering emodel: {emodel_class.NAME} -> {emodel_class.NAME.lower()}")
        register_emodel(emodel_class)
        save_emodel_to_db(emodel_class, conn)
        create_emodel_udf(emodel_class.NAME, conn)
        
    print("✅ All filters (Main + CP Filters + Fmodels + Emodels) registered successfully in DuckDB.")

    # Print table contents for verification
    for table in ["filters", "cps", "fmodels", "emodels"]:  # Added emodels to the list
        result = conn.execute(f"SELECT * FROM {table}")
        print(f"\n{table.capitalize()} Table Contents:")
        for row in result.fetchall():
            print(row)
        
    try:
        conn.create_function(
            "calc_indentation",
            calc_indentation,
            [
                duckdb.list_type('DOUBLE'),                # z_values: DOUBLE[]
                duckdb.list_type('DOUBLE'),                # force_values: DOUBLE[]
                duckdb.list_type(duckdb.list_type('DOUBLE')),  # cp: DOUBLE[][]
                'DOUBLE',                                  # spring_constant: DOUBLE
                'BOOLEAN'                                  # set_zero_force: BOOLEAN
            ],
            duckdb.list_type(duckdb.list_type('DOUBLE')),  # Return: DOUBLE[][]
            null_handling='SPECIAL'
        )
    except duckdb.CatalogException as e:
        if "already exists" in str(e):
            print(f"Function 'calc_indentation' already exists. Skipping creation.")
        else:
            raise
    
    # Registration with DuckDB
    try:
        conn.create_function(
            "calc_elspectra",
            calc_elspectra,
            [
                duckdb.list_type('DOUBLE'),    # z_values: DOUBLE[]
                duckdb.list_type('DOUBLE'),    # force_values: DOUBLE[]
                'INTEGER',                     # win: INTEGER
                'INTEGER',                     # order: INTEGER
                'VARCHAR',                     # tip_geometry: VARCHAR
                'DOUBLE',                      # tip_radius: DOUBLE
                'DOUBLE',                      # tip_angle: DOUBLE
                'BOOLEAN'                      # interp: BOOLEAN
            ],
            duckdb.list_type(duckdb.list_type('DOUBLE')),  # Return: DOUBLE[][]
            null_handling='SPECIAL'
        )
    except duckdb.CatalogException as e:
        if "already exists" in str(e):
            print(f"Function 'calc_elspectra' already exists. Skipping creation.")
        else:
            raise

    # conn.create_function(
    #     "calc_fmodels",
    #     calc_fmodels,
    #     [
    #         duckdb.list_type('DOUBLE'),  # zi_values
    #         duckdb.list_type('DOUBLE'),  # fi_values
    #         'DOUBLE',                    # zi_min
    #         'DOUBLE',                    # zi_max
    #         'VARCHAR',                   # model (string type for 'hertz', 'hertzEffective', etc.)
    #         'DOUBLE'                     # poisson
    #     ],
    #     duckdb.list_type(duckdb.list_type('DOUBLE')),  # Return type: List[List[Double]]
    #     null_handling='SPECIAL',
    #     side_effects=False
    # )

    # conn.create_function(
    #     "calc_emodels",
    #     calc_emodels,
    #     [
    #         duckdb.list_type('DOUBLE'),  # ze_values
    #         duckdb.list_type('DOUBLE'),  # fe_values
    #         'DOUBLE',                    # ze_min
    #         'DOUBLE',                    # ze_max
    #         'VARCHAR',                   # model (string type for 'bilayer', 'linemax', etc.)
    #         'DOUBLE'                     # poisson
    #     ],
    #     duckdb.list_type(duckdb.list_type('DOUBLE')),  # Return type: List[List[Double]]
    #     null_handling='SPECIAL',
    #     side_effects=False
    # )
    # conn.create_function(
    #     "hertzeffective_theory",
    #     theoryHertzEffective,
    #     [
    #         duckdb.list_type('DOUBLE'),  # z_values: DOUBLE[]
    #         duckdb.list_type('DOUBLE'),  # force_values: DOUBLE[]
    #         'DOUBLE'                     # elastic: DOUBLE
    #     ],
    #     duckdb.list_type('DOUBLE'),  # Return: DOUBLE[]
    #     null_handling='SPECIAL'
    # )

    # conn.create_function(
    #     "hertzlinear_theory",
    #     theoryHertzLine ,
    #     [
    #         duckdb.list_type('DOUBLE'),  # z_values: DOUBLE[]
    #         duckdb.list_type('DOUBLE'),  # force_values: DOUBLE[]
    #         'DOUBLE',                    # poisson: DOUBLE
    #         'DOUBLE',                    # E: DOUBLE
    #         'DOUBLE',                    # m: DOUBLE
    #         'VARCHAR',                   # tip_geometry: STRING
    #         'DOUBLE',                    # R: DOUBLE (nullable)
    #         'DOUBLE'                     # ang: DOUBLE (nullable)
    #     ],
    #     duckdb.list_type('DOUBLE'),  # Return: DOUBLE[]
    #     null_handling='SPECIAL'
    # )