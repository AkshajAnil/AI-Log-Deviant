from sqlalchemy import Column, Integer, String, Text
from database import Base

class Deviation(Base):
    __tablename__ = "deviations"

    id = Column(Integer, primary_key=True, index=True)
    site_plant = Column(String(255), index=True)
    date_of_occurrence = Column(String(50))
    title_short_description = Column(String(500))
    source = Column(String(255))
    related_product_material = Column(String(255))
    batch_lot_number = Column(String(100))
    detailed_description = Column(Text)
    initial_impact = Column(String(50))
    initial_severity = Column(String(50))
    suggested_next_action = Column(Text)
    initial_risk_assessment = Column(Text)
