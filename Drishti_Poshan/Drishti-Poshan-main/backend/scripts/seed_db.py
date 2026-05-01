"""
Drishti Poshan — Database Seeder (scripts/seed_db.py)
=====================================================
Generates 500 medically-accurate child health records with:
  • Marathi/Hindi names (Faker hi_IN locale + curated lists)
  • Pune district villages & fictional Anganwadi centers
  • WHO-correlated weight/height for age
  • MUAC-driven risk classification (10% SEVERE, 20% MODERATE, 70% NORMAL)
  • Timestamps spread across last 6 months
  • 1–4 longitudinal observations per child

Usage:
  cd backend
  pip install faker  (if not already installed)
  python -m scripts.seed_db
"""

import asyncio
import random
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path

# ── Ensure project root is on sys.path ─────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from faker import Faker

# ── WHO Growth Approximation Tables ───────────────────────
# Median weight (kg) by age in months — WHO 2006 standards (averaged M/F)
WHO_WEIGHT_MEDIAN = {
    6: 7.5, 9: 8.5, 12: 9.5, 15: 10.2, 18: 10.8, 21: 11.3, 24: 11.8,
    30: 12.8, 36: 13.8, 42: 14.8, 48: 15.8, 54: 16.8, 60: 17.8,
}

# Median height (cm) by age in months — WHO 2006 standards (averaged M/F)
WHO_HEIGHT_MEDIAN = {
    6: 66.0, 9: 70.0, 12: 74.0, 15: 77.0, 18: 80.0, 21: 83.0, 24: 85.5,
    30: 90.0, 36: 94.0, 42: 98.0, 48: 101.5, 54: 105.0, 60: 108.0,
}


def interpolate_who(table: dict, age_months: int) -> float:
    """Linearly interpolate between WHO milestone values."""
    keys = sorted(table.keys())
    if age_months <= keys[0]:
        return table[keys[0]]
    if age_months >= keys[-1]:
        return table[keys[-1]]
    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= age_months <= hi:
            frac = (age_months - lo) / (hi - lo)
            return table[lo] + frac * (table[hi] - table[lo])
    return table[keys[-1]]


# ── Curated Marathi/Hindi Name Lists ──────────────────────
CHILD_NAMES_MALE = [
    "Aryan", "Viraj", "Arjun", "Om", "Shivam", "Aditya", "Rohan", "Yash",
    "Pranav", "Krishna", "Siddharth", "Aniket", "Rahul", "Soham", "Tejas",
    "Rituraj", "Abhishek", "Gaurav", "Mihir", "Atharv", "Vedant", "Sarthak",
    "Chinmay", "Parth", "Dhruv", "Harsh", "Nikhil", "Vivek", "Sanket", "Akash",
    "Devendra", "Vinay", "Amit", "Raj", "Sachin", "Pratik", "Mayur", "Sumit",
    "Anand", "Ganesh", "Swaraj", "Rudra", "Digambar", "Sangam", "Kishor",
]

CHILD_NAMES_FEMALE = [
    "Ananya", "Sakshi", "Pooja", "Shruti", "Aaradhya", "Isha", "Divya",
    "Sara", "Tanvi", "Rutuja", "Priya", "Kavya", "Madhavi", "Amruta",
    "Sneha", "Rupa", "Sanjeevani", "Manasi", "Gauri", "Anjali", "Neha",
    "Pallavi", "Vaishali", "Meghna", "Rashmi", "Swati", "Sonali", "Pratiksha",
    "Shivani", "Komal", "Ruchi", "Deepika", "Ashwini", "Supriya", "Jyoti",
]

GUARDIAN_NAMES_MALE = [
    "Rajesh Patil", "Suresh Jadhav", "Amit Shinde", "Vinod Kulkarni",
    "Mahesh Deshmukh", "Prakash More", "Sanjay Pawar", "Ashok Salunke",
    "Ganesh Gaikwad", "Narayan Bhosale", "Satish Kale", "Dilip Chavan",
    "Manoj Waghmare", "Ramesh Bhagat", "Prasad Joshi", "Vijay Nikam",
    "Anil Shelar", "Sudhir Thakur", "Sandeep Kadam", "Ravindra Bagwe",
]

GUARDIAN_NAMES_FEMALE = [
    "Sunita Patil", "Maya Jadhav", "Priya Shinde", "Lalita Kulkarni",
    "Kavita Deshmukh", "Archana More", "Suman Pawar", "Shobha Salunke",
    "Vandana Gaikwad", "Anuradha Bhosale", "Sadhana Kale", "Sarita Chavan",
    "Jyoti Waghmare", "Sushma Bhagat", "Manisha Joshi", "Usha Nikam",
    "Rekha Shelar", "Shubhangi Thakur", "Snehalata Kadam", "Meena Bagwe",
]

# ── Pune District Geography ──────────────────────────────
VILLAGES = {
    "Haveli": ["Loni Kalbhor", "Wagholi", "Alandi", "Uruli Kanchan", "Phursungi"],
    "Khed": ["Chakan", "Rajgurunagar", "Aale", "Khed", "Manchar"],
    "Maval": ["Lonavala", "Talegaon Dabhade", "Vadgaon", "Kamshet", "Pawna"],
    "Shirur": ["Shirur", "Paragaon", "Ranjangaon", "Koregaon Bhima", "Takali"],
    "Baramati": ["Baramati", "Malegaon", "Supe", "Indapur", "Daund"],
    "Mulshi": ["Pirangut", "Lavale", "Paud", "Mulshi", "Bhugaon"],
    "Ambegaon": ["Ghodegaon", "Manchar", "Ambegaon", "Narayangaon", "Junnar"],
}

ANGANWADI_TEMPLATES = [
    "Anganwadi No. {n}, {v}",
    "{v} Child Dev Center {n}",
    "Mini Anganwadi {v}-{n}",
]

# ── MUAC / Risk Classification Logic ─────────────────────
# Distribution targets: 70% NORMAL, 20% MODERATE, 10% SEVERE
def generate_muac_and_risk(target_risk: str) -> tuple:
    """Generate medically-correlated MUAC and risk classification."""
    if target_risk == "SEVERE":
        muac = round(random.uniform(9.5, 11.4), 1)
        return muac, "severe", "SEVERE"
    elif target_risk == "MODERATE":
        muac = round(random.uniform(11.5, 12.5), 1)
        return muac, "moderate", "MODERATE"
    else:  # NORMAL
        muac = round(random.uniform(12.6, 16.0), 1)
        return muac, "normal", "NORMAL"


def generate_weight(age_months: int, risk: str) -> float:
    """Generate medically-correlated weight based on age and risk."""
    median = interpolate_who(WHO_WEIGHT_MEDIAN, age_months)
    if risk == "SEVERE":
        # -3 to -2 SD below median (~70-80% of median)
        factor = random.uniform(0.65, 0.78)
    elif risk == "MODERATE":
        # -2 to -1 SD below median (~80-90% of median)
        factor = random.uniform(0.78, 0.90)
    else:
        # ±1 SD around median (~90-115% of median)
        factor = random.uniform(0.90, 1.15)
    return round(median * factor, 1)


def generate_height(age_months: int, risk: str) -> float:
    """Generate medically-correlated height based on age and risk."""
    median = interpolate_who(WHO_HEIGHT_MEDIAN, age_months)
    if risk == "SEVERE":
        factor = random.uniform(0.88, 0.95)  # stunted
    elif risk == "MODERATE":
        factor = random.uniform(0.93, 0.98)
    else:
        factor = random.uniform(0.97, 1.05)
    return round(median * factor, 1)


# ── Z-Score Approximation ────────────────────────────────
def approx_z(actual: float, median: float, sd_approx: float = None) -> float:
    """Approximate Z-score = (actual - median) / SD."""
    if median == 0:
        return 0.0
    # Approximate SD as ~10% of median (standard for WHO child growth)
    sd = sd_approx or (median * 0.10)
    return round((actual - median) / sd, 2)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async def seed():
    """Main seeding function."""
    from app.database import async_session, init_db
    from app.models.child import Child, Observation
    from sqlalchemy import select, func

    fake = Faker("hi_IN")
    Faker.seed(42)
    random.seed(42)

    # Initialize database (creates tables if missing)
    await init_db()

    async with async_session() as session:
        # ── Safeguard: check if data exists ────────────────
        count_result = await session.execute(select(func.count(Child.id)))
        existing_count = count_result.scalar()

        if existing_count > 0:
            print(f"\n📋 Database already contains {existing_count} children.")
            print(f"   Adding 500 new records alongside existing data...\n")

        # ── Build geographic lookup ───────────────────────
        village_centers = {}
        for taluka, villages in VILLAGES.items():
            for village in villages:
                template = random.choice(ANGANWADI_TEMPLATES)
                centers = [
                    template.format(n=i, v=village)
                    for i in range(1, random.randint(2, 4))
                ]
                village_centers[village] = centers

        all_villages = list(village_centers.keys())

        # ── Risk distribution ─────────────────────────────
        # 500 records: 350 NORMAL, 100 MODERATE, 50 SEVERE
        risk_assignments = (
            ["SEVERE"] * 50 +
            ["MODERATE"] * 100 +
            ["NORMAL"] * 350
        )
        random.shuffle(risk_assignments)

        now = datetime.utcnow()
        six_months_ago = now - timedelta(days=180)

        children_created = 0
        observations_created = 0

        print(f"\n🌱 Seeding 500 children with observations...")
        print(f"   Distribution: 350 NORMAL | 100 MODERATE | 50 SEVERE")
        print(f"   Temporal range: {six_months_ago.strftime('%Y-%m-%d')} → {now.strftime('%Y-%m-%d')}")
        print()

        for i in range(500):
            target_risk = risk_assignments[i]
            sex = random.choice(["M", "F"])
            age_months = random.randint(6, 60)

            # Name selection
            if sex == "M":
                name = random.choice(CHILD_NAMES_MALE)
                guardian = random.choice(GUARDIAN_NAMES_MALE)
            else:
                name = random.choice(CHILD_NAMES_FEMALE)
                guardian = random.choice(GUARDIAN_NAMES_FEMALE)

            # Sometimes add a transliterated English name variant
            if random.random() < 0.3:
                name = fake.first_name()

            # Geography
            village = random.choice(all_villages)
            center = random.choice(village_centers[village])

            # Generate medically-correlated measurements
            muac, risk_level, status = generate_muac_and_risk(target_risk)
            weight = generate_weight(age_months, target_risk)
            height = generate_height(age_months, target_risk)

            # Registration timestamp (spread across 6 months)
            days_offset = random.randint(0, 180)
            created_at = six_months_ago + timedelta(
                days=days_offset,
                hours=random.randint(8, 18),
                minutes=random.randint(0, 59),
            )

            child = Child(
                name=name,
                age_months=age_months,
                sex=sex,
                weight_kg=weight,
                height_cm=height,
                muac_cm=muac,
                guardian_name=guardian,
                anganwadi_center=center,
                village=village,
                risk_level=risk_level,
                status=status,
                is_deleted=False,
                created_at=created_at,
                updated_at=created_at,
            )
            session.add(child)
            await session.flush()  # get child.id
            children_created += 1

            # ── Generate 1-4 longitudinal observations ────
            num_obs = random.randint(1, 4)
            obs_base = created_at

            for j in range(num_obs):
                # Each observation is 15-45 days apart
                obs_offset = timedelta(days=random.randint(15, 45) * j)
                obs_time = obs_base + obs_offset

                # Don't create future observations
                if obs_time > now:
                    break

                # Slight variation from the child's baseline
                obs_weight = round(weight + random.uniform(-0.3, 0.5) * (j + 1), 1)
                obs_height = round(height + random.uniform(0, 0.3) * (j + 1), 1)
                obs_muac = round(muac + random.uniform(-0.2, 0.3) * j, 1)

                # Ensure weight doesn't go below minimum
                obs_weight = max(obs_weight, 2.0)
                obs_muac = max(obs_muac, 9.0)

                # Compute approximate Z-scores
                w_median = interpolate_who(WHO_WEIGHT_MEDIAN, age_months + j)
                h_median = interpolate_who(WHO_HEIGHT_MEDIAN, age_months + j)

                waz = approx_z(obs_weight, w_median)
                haz = approx_z(obs_height, h_median)

                # WHZ approximation (using weight-for-height)
                expected_w_for_h = obs_height * 0.12 - 1.5  # rough linear approx
                whz = approx_z(obs_weight, max(expected_w_for_h, 5.0))

                # BMI-Z approximation
                bmi = obs_weight / ((obs_height / 100) ** 2)
                bmi_median = 15.5  # average BMI for young children
                bmi_z = approx_z(bmi, bmi_median, sd_approx=1.5)

                # Determine observation-level status
                if obs_muac < 11.5:
                    obs_risk, obs_status = "severe", "SEVERE"
                elif obs_muac <= 12.5:
                    obs_risk, obs_status = "moderate", "MODERATE"
                else:
                    obs_risk, obs_status = "normal", "NORMAL"

                obs = Observation(
                    child_id=child.id,
                    timestamp=obs_time,
                    weight_kg=obs_weight,
                    height_cm=obs_height,
                    muac_cm=obs_muac,
                    waz=waz,
                    haz=haz,
                    whz=whz,
                    bmi_z=bmi_z,
                    risk_level=obs_risk,
                    status=obs_status,
                    notes=None,
                )
                session.add(obs)
                observations_created += 1

            # Progress indicator
            if (i + 1) % 100 == 0:
                print(f"   ✓ {i + 1}/500 children created...")

        await session.commit()

    print(f"\n{'=' * 50}")
    print(f"  ✅ SEED COMPLETE")
    print(f"{'=' * 50}")
    print(f"  Children:     {children_created}")
    print(f"  Observations: {observations_created}")
    print(f"  Risk breakdown:")

    # Verify distribution
    async with async_session() as session:
        for status in ["SEVERE", "MODERATE", "NORMAL"]:
            result = await session.execute(
                select(func.count(Child.id)).where(Child.status == status)
            )
            count = result.scalar()
            pct = (count / children_created * 100) if children_created > 0 else 0
            emoji = {"SEVERE": "🔴", "MODERATE": "🟡", "NORMAL": "🟢"}[status]
            print(f"    {emoji} {status:10s}: {count:4d}  ({pct:.0f}%)")

    print(f"\n  📊 Dashboard is now fully populated!")
    print(f"  🚀 Restart the backend and navigate to /analytics\n")


if __name__ == "__main__":
    asyncio.run(seed())
