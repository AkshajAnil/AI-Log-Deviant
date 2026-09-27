from pydantic import BaseModel
from datetime import date
from typing import Optional

class DeviationBase(BaseModel):
    site_plant: Optional[str] = None
    date_of_occurrence: Optional[str] = None
    title_short_description: Optional[str] = None
    source: Optional[str] = None
    related_product_material: Optional[str] = None
    batch_lot_number: Optional[str] = None
    detailed_description: Optional[str] = None
    initial_impact: Optional[str] = None
    initial_severity: Optional[str] = None
    suggested_next_action: Optional[str] = None
    initial_risk_assessment: Optional[str] = None

class DeviationCreate(DeviationBase):
    pass

class Deviation(DeviationBase):
    id: int

    class Config:
        from_attributes = True

class ExtractionResult(BaseModel):
    site_plant: Optional[str] = None
    date_of_occurrence: Optional[str] = None
    title_short_description: Optional[str] = None
    source: Optional[str] = None
    related_product_material: Optional[str] = None
    batch_lot_number: Optional[str] = None
    detailed_description: Optional[str] = None
    initial_impact: Optional[str] = None
    initial_severity: Optional[str] = None
    impact_reason: Optional[str] = None
    suggested_next_action: Optional[str] = None
    initial_risk_assessment: Optional[str] = None
