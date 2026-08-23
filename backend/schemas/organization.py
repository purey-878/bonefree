from pydantic import BaseModel


class ResolvedOrganizationResponse(BaseModel):
    slug: str
    name: str
