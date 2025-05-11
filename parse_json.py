import json
import sys
import uuid

def optimize_warhammer_roster(input_file, output_file):
    """
    Parse and optimize a Warhammer 40k roster JSON file
    """
    # Load the original JSON data with proper encoding
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Initialize the optimized structure
    optimized = {
        "armyName": data.get("name", "Unknown Army"),
        "faction": extract_faction(data),
        "pointsTotal": extract_points(data),
        "rules": {},
        "abilities": {},
        "units": []
    }
    
    # Process the forces
    for force in data["roster"]["forces"]:
        # Extract global rules
        if "rules" in force:
            for rule in force["rules"]:
                rule_id = rule["id"]
                optimized["rules"][rule_id] = {
                    "id": rule_id,
                    "name": rule["name"],
                    "description": rule.get("description", ""),
                    "hidden": rule.get("hidden", False)
                }
        
        # Extract units
        extract_units(force["selections"], optimized)
    
    # Write the optimized data to the output file with proper encoding
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(optimized, f, indent=2, ensure_ascii=False)
    
    # Print statistics
    original_size = len(json.dumps(data, ensure_ascii=False))
    optimized_size = len(json.dumps(optimized, ensure_ascii=False))
    print(f"Original file size: {original_size:,} bytes")
    print(f"Optimized file size: {optimized_size:,} bytes")
    print(f"Compression ratio: {optimized_size / original_size:.2f}")
    print(f"Space saving: {(1 - optimized_size / original_size) * 100:.1f}%")

def extract_faction(data):
    """Extract the faction name from the roster data"""
    try:
        forces = data["roster"]["forces"]
        if forces and "selections" in forces[0]:
            for selection in forces[0]["selections"]:
                if "name" in selection and selection["name"] == "Detachment":
                    if "selections" in selection and selection["selections"]:
                        return selection["selections"][0]["name"]
    except (KeyError, IndexError):
        pass
    
    return "Unknown Faction"

def extract_points(data):
    """Extract the total points cost from the roster data"""
    try:
        return int(data["roster"]["points"]["total"])
    except (KeyError, ValueError):
        return 0

def extract_units(selections, optimized, parent=None):
    """Extract units from selections"""
    for selection in selections:
        # Skip configuration entries
        if is_configuration(selection):
            continue
        
        # Check if this is a unit or model
        if is_unit_or_model(selection):
            unit = create_unit(selection, optimized)
            
            # Add the unit to the units list or to parent's models
            if parent:
                if "models" not in parent:
                    parent["models"] = []
                parent["models"].append(unit)
            else:
                optimized["units"].append(unit)
            
            # Process subselections for this unit
            if "selections" in selection:
                extract_weapons_abilities_rules(selection["selections"], optimized, unit)
                
                # Process sub-models if this is a multi-model unit
                if is_multi_model_unit(selection):
                    extract_units(selection["selections"], optimized, unit)
        
        # Process subselections
        elif "selections" in selection:
            extract_units(selection["selections"], optimized, parent)

def extract_weapons_abilities_rules(selections, optimized, unit):
    """Extract weapons, abilities, and rules from selections"""
    # Dictionary to track weapon counts and model counts for this unit only
    weapon_counts = {}
    
    def process_selection(selection, model_count=1):
        # Process weapons from profiles
        if "profiles" in selection:
            for profile in selection["profiles"]:
                if "typeName" in profile and profile["typeName"] in ["Ranged Weapons", "Melee Weapons"]:
                    weapon_id = profile["id"]
                    # Create the weapon entry
                    weapon = {
                        "id": weapon_id,
                        "name": profile["name"],
                        "type": profile["typeName"],
                        "characteristics": extract_characteristics(profile)
                    }
                    
                    # Check if this is a firing mode weapon (starts with ➤)
                    if profile["name"].startswith("➤"):
                        # Extract the base weapon name by removing the mode
                        base_name = profile["name"].split(" - ")[0]  # Split on " - " instead of " ("
                        weapon["base_name"] = base_name
                        weapon["overcharge_mode"] = "overcharge" if "overcharge" in profile["name"].lower() else "standard"
                        
                        # Add to linked weapons collection
                        if "linked_weapons" not in unit:
                            unit["linked_weapons"] = {}
                        if base_name not in unit["linked_weapons"]:
                            unit["linked_weapons"][base_name] = {
                                "standard": None,
                                "overcharge": None
                            }
                        # Store the weapon ID in the appropriate mode
                        unit["linked_weapons"][base_name][weapon["overcharge_mode"]] = weapon_id
                    
                    # Get the number of weapons per model from the weapon profile
                    number_of_weapons = selection.get("number", 1)  # Get the number field from the weapon profile
                    
                    # Calculate total weapon count for this unit only
                    total_weapons = number_of_weapons
                    
                    # Update weapon counts for this unit only
                    if weapon_id in weapon_counts:
                        weapon_counts[weapon_id]["count"] += total_weapons
                        weapon_counts[weapon_id]["models_with_weapon"] += model_count
                    else:
                        weapon_counts[weapon_id] = {
                            "weapon": weapon,
                            "count": total_weapons,
                            "models_with_weapon": model_count
                        }
                elif "typeName" in profile and profile["typeName"] == "Abilities":
                    ability_id = profile["id"]
                    
                    # Add ability to the global abilities collection
                    if ability_id not in optimized["abilities"]:
                        ability = {
                            "id": ability_id,
                            "name": profile["name"],
                            "description": ""
                        }
                        
                        # Extract description
                        if "characteristics" in profile:
                            for char in profile["characteristics"]:
                                if char["name"] == "Description":
                                    ability["description"] = char.get("$text", "")
                        
                        optimized["abilities"][ability_id] = ability
                    
                    # Add ability reference to the unit
                    if "abilities" not in unit:
                        unit["abilities"] = []
                    if ability_id not in unit["abilities"]:
                        unit["abilities"].append(ability_id)
        
        # Process rules
        if "rules" in selection:
            for rule in selection["rules"]:
                rule_id = rule["id"]
                
                # Add rule to global collection
                if rule_id not in optimized["rules"]:
                    optimized["rules"][rule_id] = {
                        "id": rule_id,
                        "name": rule["name"],
                        "description": rule.get("description", ""),
                        "hidden": rule.get("hidden", False)
                    }
                
                # Add rule reference to the unit
                if "rules" not in unit:
                    unit["rules"] = []
                if rule_id not in unit["rules"]:
                    unit["rules"].append(rule_id)
        
        # Recursively process subselections
        if "selections" in selection:
            for subselection in selection["selections"]:
                # Skip if this is a configuration
                if is_configuration(subselection):
                    continue
                
                # Get the number of models for this subselection
                sub_count = subselection.get("number", 1)
                
                # If this is a model selection, use its count
                if is_unit_or_model(subselection):
                    process_selection(subselection, sub_count)
                else:
                    # For non-model selections, use the current model count
                    process_selection(subselection, model_count)
    
    # Process all selections for this unit only
    for selection in selections:
        # Skip if this is a configuration
        if is_configuration(selection):
            continue
        
        # Get the number of models for this selection
        model_count = selection.get("number", 1)
        
        # If this is a model selection, use its count
        if is_unit_or_model(selection):
            process_selection(selection, model_count)
        else:
            # For non-model selections, use the unit's count
            process_selection(selection, unit.get("count", 1))
    
    # Add weapons to the unit with their counts
    if weapon_counts:
        unit["weapons"] = []
        for weapon_data in weapon_counts.values():
            weapon = weapon_data["weapon"]
            weapon["count"] = weapon_data["count"]
            weapon["models_with_weapon"] = weapon_data["models_with_weapon"]
            unit["weapons"].append(weapon)

def create_unit(selection, optimized):
    """Create a unit entry from a selection"""
    unit = {
        "id": selection.get("id", str(uuid.uuid4())[:8]),
        "name": selection["name"],
        "type": get_primary_category(selection),
        "stats": extract_unit_stats(selection),
        "points": get_points_cost(selection),
        "count": selection.get("number", 1)
    }
    
    # Process rules directly attached to the unit
    if "rules" in selection:
        unit["rules"] = []
        for rule in selection["rules"]:
            rule_id = rule["id"]
            
            # Add rule to global collection
            if rule_id not in optimized["rules"]:
                optimized["rules"][rule_id] = {
                    "id": rule_id,
                    "name": rule["name"],
                    "description": rule.get("description", ""),
                    "hidden": rule.get("hidden", False)
                }
            
            # Add reference to the unit
            unit["rules"].append(rule_id)
    
    # Process abilities directly attached to the unit
    if "profiles" in selection:
        for profile in selection["profiles"]:
            if "typeName" in profile and profile["typeName"] == "Abilities":
                ability_id = profile["id"]
                
                # Add ability to global collection
                if ability_id not in optimized["abilities"]:
                    ability = {
                        "id": ability_id,
                        "name": profile["name"],
                        "description": ""
                    }
                    
                    # Extract description
                    if "characteristics" in profile:
                        for char in profile["characteristics"]:
                            if char["name"] == "Description":
                                ability["description"] = char.get("$text", "")
                    
                    optimized["abilities"][ability_id] = ability
                
                # Add reference to the unit
                if "abilities" not in unit:
                    unit["abilities"] = []
                if ability_id not in unit["abilities"]:
                    unit["abilities"].append(ability_id)
    
    return unit

def extract_unit_stats(selection):
    """Extract the main stats of a unit from its profiles"""
    # Initialize default stats
    stats = {
        "move": "",
        "toughness": "",
        "save": "",
        "wounds": "",
        "leadership": "",
        "objectiveControl": ""
    }
    
    # First try to get stats from the unit's own profiles
    for profile in selection.get("profiles", []):
        if "typeName" in profile and profile["typeName"] == "Unit":
            if "characteristics" in profile:
                for char in profile["characteristics"]:
                    name = char["name"]
                    value = char.get("$text", "")
                    
                    if name == "M":
                        stats["move"] = value
                    elif name == "T":
                        stats["toughness"] = value
                    elif name == "SV":
                        stats["save"] = value
                    elif name == "W":
                        stats["wounds"] = value
                    elif name == "LD":
                        stats["leadership"] = value
                    elif name == "OC":
                        stats["objectiveControl"] = value
    
    # If we didn't find stats in the unit's profiles, try to find them in subselections
    if all(not v for v in stats.values()) and "selections" in selection:
        for subselection in selection["selections"]:
            # Skip if this is a configuration or not a model
            if is_configuration(subselection) or not is_unit_or_model(subselection):
                continue
                
            # Look for stats in the model's profiles
            for profile in subselection.get("profiles", []):
                if "typeName" in profile and profile["typeName"] == "Unit":
                    if "characteristics" in profile:
                        for char in profile["characteristics"]:
                            name = char["name"]
                            value = char.get("$text", "")
                            
                            if name == "M" and not stats["move"]:
                                stats["move"] = value
                            elif name == "T" and not stats["toughness"]:
                                stats["toughness"] = value
                            elif name == "SV" and not stats["save"]:
                                stats["save"] = value
                            elif name == "W" and not stats["wounds"]:
                                stats["wounds"] = value
                            elif name == "LD" and not stats["leadership"]:
                                stats["leadership"] = value
                            elif name == "OC" and not stats["objectiveControl"]:
                                stats["objectiveControl"] = value
    
    # If we still don't have all stats, try to find them in the parent selection
    if all(not v for v in stats.values()) and "parent" in selection:
        parent = selection["parent"]
        for profile in parent.get("profiles", []):
            if "typeName" in profile and profile["typeName"] == "Unit":
                if "characteristics" in profile:
                    for char in profile["characteristics"]:
                        name = char["name"]
                        value = char.get("$text", "")
                        
                        if name == "M" and not stats["move"]:
                            stats["move"] = value
                        elif name == "T" and not stats["toughness"]:
                            stats["toughness"] = value
                        elif name == "SV" and not stats["save"]:
                            stats["save"] = value
                        elif name == "W" and not stats["wounds"]:
                            stats["wounds"] = value
                        elif name == "LD" and not stats["leadership"]:
                            stats["leadership"] = value
                        elif name == "OC" and not stats["objectiveControl"]:
                            stats["objectiveControl"] = value
    
    # Only return stats if we found at least one value
    return stats if any(stats.values()) else {}

def extract_characteristics(profile):
    """Extract characteristics from a profile"""
    characteristics = {}
    if "characteristics" in profile:
        for char in profile["characteristics"]:
            name = char["name"]
            value = char.get("$text", "")
            characteristics[name.lower()] = value
    return characteristics

def get_primary_category(selection):
    """Get the primary category of a selection"""
    if "categories" in selection:
        for category in selection["categories"]:
            if category.get("primary", False):
                return category["name"]
    return "Unknown"

def get_points_cost(selection):
    """Get the points cost of a selection"""
    if "costs" in selection:
        for cost in selection["costs"]:
            if cost["name"] == "pts":
                return int(cost["value"])
    return 0

def is_configuration(selection):
    """Check if a selection is a configuration entry"""
    return selection.get("type", "") == "configuration"

def is_unit_or_model(selection):
    """Check if a selection is a unit or model"""
    return selection.get("type", "") in ["unit", "model"]

def is_multi_model_unit(selection):
    """Check if a selection is a multi-model unit"""
    return selection.get("type", "") == "unit" and selection.get("number", 1) > 1

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python wh40k_roster_optimizer.py input_file.json output_file.json")
        #optimize_warhammer_roster("800p army.json", "800popti.json")
        #sys.exit(1)
    else:
        optimize_warhammer_roster(sys.argv[1], sys.argv[2])