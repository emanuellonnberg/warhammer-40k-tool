import json
import re
import sys
import uuid

REROLL_REGEX = re.compile(
    r"re-?roll(?: [a-z']+)* (?P<type>hit|wound|damage) roll(?:s)?(?: of (?P<ones>1s?|ones))?",
    re.IGNORECASE
)

UNIT_SCOPE_MARKERS = [
    "leading a unit",
    "unit contains",
    "models in that unit",
    "attached unit",
    "while this unit",
    "bodyguard unit"
]

ROLL_KEY_MAP = {
    "hit": "hits",
    "wound": "wounds",
    "damage": "damage"
}

MODIFIER_PATTERNS = [
    (re.compile(r"add\s+(\d+)\s+to\s+(?:the\s+)?(hit|wound) roll", re.IGNORECASE), 1),
    (re.compile(r"add\s+(\d+)\s+to\s+(?:the\s+)?(hit|wound) rolls", re.IGNORECASE), 1),
    (re.compile(r"improve\s+(?:the\s+)?(hit|wound) roll(?:s)? by\s+(\d+)", re.IGNORECASE), 1),
    (re.compile(r"subtract\s+(\d+)\s+from\s+(?:the\s+)?(hit|wound) roll", re.IGNORECASE), -1),
    (re.compile(r"subtract\s+(\d+)\s+from\s+(?:the\s+)?(hit|wound) rolls", re.IGNORECASE), -1),
    (re.compile(r"worsen\s+(?:the\s+)?(hit|wound) roll(?:s)? by\s+(\d+)", re.IGNORECASE), -1),
]

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
        "units": [],
        "attachments": {}
    }
    
    # Process the forces
    roster = data.get("roster", {})
    forces = roster.get("forces", [])
    if not isinstance(forces, list):
        print("Invalid roster format: 'forces' must be a list")
        return

    for force in forces:
        if not isinstance(force, dict):
            continue

        # Extract global rules
        for rule in force.get("rules", []):
            add_rule(rule, optimized)
        
        # Extract units
        selections = force.get("selections", [])
        if isinstance(selections, list):
            extract_units(selections, optimized)
    
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
    if not isinstance(selections, list):
        return

    for selection in selections:
        # Skip configuration entries
        if is_configuration(selection):
            continue
        
        # Check if this is a unit or model
        if is_unit_or_model(selection):
            unit = create_unit(selection, optimized)
            
            # Add the unit to the units list or to parent's models
            if parent and selection.get("type") == "model":
                parent.setdefault("models", []).append(unit)
            else:
                optimized["units"].append(unit)
            
            # Register default attachments when a leader is already embedded in a host unit
            if (
                parent
                and not parent.get("isLeader")
                and unit.get("isLeader")
                and selection.get("type") != "model"
            ):
                register_default_attachment(optimized, parent, unit)
            
            # Process subselections for this unit
            if "selections" in selection:
                extract_weapons_abilities_rules(selection["selections"], optimized, unit)
                extract_units(selection["selections"], optimized, unit)
        
        # Process subselections
        elif "selections" in selection:
            extract_units(selection["selections"], optimized, parent)

def add_rule(rule, optimized):
    """Add a rule to the optimized structure and return its id."""
    if not isinstance(rule, dict):
        return None
    rule_id = rule.get("id")
    if not rule_id:
        return None

    if rule_id not in optimized["rules"]:
        optimized["rules"][rule_id] = {
            "id": rule_id,
            "name": rule.get("name", "Unnamed Rule"),
            "description": rule.get("description", ""),
            "hidden": rule.get("hidden", False)
        }
    return rule_id


def add_ability(profile, optimized):
    """Add an ability profile to the optimized structure and return its id."""
    if not isinstance(profile, dict):
        return None
    ability_id = profile.get("id")
    if not ability_id:
        return None

    if ability_id not in optimized["abilities"]:
        ability = {
            "id": ability_id,
            "name": profile.get("name", "Unnamed Ability"),
            "description": ""
        }

        for char in profile.get("characteristics", []):
            if char.get("name") == "Description":
                ability["description"] = char.get("$text", "")
                break

        optimized["abilities"][ability_id] = ability

    return ability_id


def maybe_add_leader_metadata(profile, unit):
    """Set leader metadata on a unit if the profile describes a Leader ability."""
    if not isinstance(profile, dict) or not isinstance(unit, dict):
        return
    
    name = profile.get("name", "").strip().lower()
    if name != "leader":
        return
    
    description = extract_profile_description(profile)
    options = extract_leader_options(description)
    
    unit["isLeader"] = True
    if options:
        leader_options = unit.setdefault("leaderOptions", [])
        for option in options:
            if option not in leader_options:
                leader_options.append(option)


def maybe_add_reroll_metadata(profile, unit):
    """Detect reroll abilities and store structured metadata on the unit."""
    if not isinstance(profile, dict) or not isinstance(unit, dict):
        return
    
    description = extract_profile_description(profile)
    reroll_data = extract_reroll_effects(description)
    if reroll_data:
        apply_reroll_effects(unit, reroll_data)


def maybe_add_modifier_metadata(profile, unit):
    """Detect hit/wound modifiers and store metadata."""
    if not isinstance(profile, dict) or not isinstance(unit, dict):
        return
    
    description = extract_profile_description(profile)
    modifier_data = extract_modifier_effects(description)
    if modifier_data:
        apply_modifier_effects(unit, modifier_data)


def extract_profile_description(profile):
    """Get the description text from a profile's characteristics."""
    for char in profile.get("characteristics", []):
        if char.get("name") == "Description":
            return char.get("$text", "")
    return ""


def extract_leader_options(description):
    """Parse the description text to extract eligible bodyguard units."""
    if not description:
        return []
    
    bullet_prefixes = ("■", "-", "•", "*", "–", "—")
    options = []
    
    for line in description.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        
        # Look for bullet-prefixed lines
        if stripped.startswith(bullet_prefixes):
            option = stripped.lstrip("".join(bullet_prefixes)).strip()
        else:
            # Match patterns like "Battleline: Unit Name" or similar if present
            bullet_match = re.match(r"^[\u25A0\u25CF\u25AA\u2022\u2023\-–—]\s*(.+)$", stripped)
            option = bullet_match.group(1).strip() if bullet_match else ""
        
        if option:
            options.append(option)
    
    return options


def extract_reroll_effects(description):
    """Return reroll metadata extracted from ability text."""
    if not description:
        return None
    
    normalized = description.lower()
    if "re-roll" not in normalized:
        return None
    
    scope = "unit" if any(marker in normalized for marker in UNIT_SCOPE_MARKERS) else "self"
    effects = {}
    
    for match in REROLL_REGEX.finditer(normalized):
        roll_type = match.group("type")
        key = ROLL_KEY_MAP.get(roll_type)
        if not key:
            continue
        
        segment = match.group(0)
        value = "all"
        if "failed" in segment:
            value = "failed"
        elif re.search(r"of\s+1s?|of\s+ones|1s|ones", segment):
            value = "ones"
        
        if key not in effects:
            effects[key] = value
    
    if not effects:
        return None
    
    return {
        "scope": scope,
        "effects": effects
    }


def apply_reroll_effects(target, reroll_data):
    """Merge reroll effects onto a unit or leader."""
    if not reroll_data:
        return
    
    effects = reroll_data["effects"]
    scope = reroll_data["scope"]
    
    if scope == "unit" and target.get("isLeader"):
        aura = target.setdefault("leaderAuraRerolls", {})
        for key, value in effects.items():
            aura.setdefault(key, value)
    else:
        unit_rerolls = target.setdefault("unitRerolls", {})
        for key, value in effects.items():
            unit_rerolls.setdefault(key, value)


def extract_modifier_effects(description):
    """Return hit/wound modifier metadata extracted from ability text."""
    if not description:
        return None
    
    normalized = description.lower()
    if "hit roll" not in normalized and "wound roll" not in normalized:
        return None
    
    scope = "unit" if any(marker in normalized for marker in UNIT_SCOPE_MARKERS) else "self"
    modifiers = {}
    
    for pattern, multiplier in MODIFIER_PATTERNS:
        for match in pattern.finditer(normalized):
            groups = match.groups()
            if len(groups) != 2:
                continue
            first, second = groups
            if first.isdigit():
                value = int(first) * multiplier
                roll_type = second
            elif second.isdigit():
                value = int(second) * multiplier
                roll_type = first
            else:
                continue
            key = ROLL_KEY_MAP.get(roll_type)
            if not key:
                continue
            modifiers[key] = modifiers.get(key, 0) + value
    
    if not modifiers:
        return None
    
    return {
        "scope": scope,
        "effects": modifiers
    }


def apply_modifier_effects(target, modifier_data):
    """Merge hit/wound modifiers onto a unit or leader aura."""
    if not modifier_data:
        return
    
    effects = modifier_data["effects"]
    scope = modifier_data["scope"]
    
    if scope == "unit" and target.get("isLeader"):
        aura = target.setdefault("leaderAuraModifiers", {})
        for key, value in effects.items():
            aura[key] = aura.get(key, 0) + value
    else:
        unit_modifiers = target.setdefault("unitModifiers", {})
        for key, value in effects.items():
            unit_modifiers[key] = unit_modifiers.get(key, 0) + value


def register_default_attachment(optimized, host, leader):
    """Record leader attachments present in the original roster."""
    host_id = host.get("id")
    leader_id = leader.get("id")
    if not host_id or not leader_id:
        return
    
    attachments = optimized.setdefault("attachments", {})
    if host_id not in attachments:
        attachments[host_id] = []
    
    if leader_id not in attachments[host_id]:
        attachments[host_id].append(leader_id)
    
    leader["defaultHostId"] = host_id

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
                    
                    # Detect hazardous keyword
                    keywords = weapon["characteristics"].get("keywords", "").lower()
                    if "hazardous" in keywords or "hazardous" in profile["name"].lower():
                        weapon["is_hazardous"] = True
                    
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
                    ability_id = add_ability(profile, optimized)
                    
                    # Attach leader metadata when applicable
                    maybe_add_leader_metadata(profile, unit)
                    maybe_add_reroll_metadata(profile, unit)
                maybe_add_modifier_metadata(profile, unit)
                    
                    # Add ability reference to the unit
                    if ability_id:
                        unit.setdefault("abilities", [])
                        if ability_id not in unit["abilities"]:
                            unit["abilities"].append(ability_id)
        
        # Process rules
        if "rules" in selection:
            for rule in selection["rules"]:
                rule_id = add_rule(rule, optimized)
                
                # Add rule reference to the unit
                if rule_id:
                    unit.setdefault("rules", [])
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
        for rule in selection["rules"]:
            rule_id = add_rule(rule, optimized)
            if rule_id:
                unit.setdefault("rules", [])
                if rule_id not in unit["rules"]:
                    unit["rules"].append(rule_id)
    
    # Process abilities directly attached to the unit
    if "profiles" in selection:
        for profile in selection["profiles"]:
            if "typeName" in profile and profile["typeName"] == "Abilities":
                ability_id = add_ability(profile, optimized)
                
                # Attach leader metadata when applicable
                maybe_add_leader_metadata(profile, unit)
                maybe_add_reroll_metadata(profile, unit)
                maybe_add_modifier_metadata(profile, unit)
                
                # Add reference to the unit
                if ability_id:
                    unit.setdefault("abilities", [])
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
        sys.exit(1)
    else:
        optimize_warhammer_roster(sys.argv[1], sys.argv[2])