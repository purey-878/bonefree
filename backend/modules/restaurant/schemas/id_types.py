from typing import Annotated

from pydantic import BeforeValidator

from utils.id_format import parse_category_id, parse_product_id


ProductId = Annotated[int, BeforeValidator(parse_product_id)]
CategoryId = Annotated[int, BeforeValidator(parse_category_id)]
