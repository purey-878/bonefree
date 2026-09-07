from __future__ import annotations

import json
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

LegalDocumentType = Literal["privacy_policy", "terms_conditions"]
LegalLocale = Literal["pt-PT", "en-GB", "de-DE"]


class LegalAttributes(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: Literal[2, 3] | None = None
    start: int | None = Field(default=None, ge=1, le=10000)
    type: Literal["1", "a", "A", "i", "I"] | None = None
    name: Literal["organization_name", "organization_contact"] | None = None
    href: str | None = Field(default=None, max_length=2000)
    target: Literal["_blank", "_self"] | None = None
    rel: str | None = None
    class_: str | None = Field(default=None, alias="class")
    title: str | None = None

    @field_validator("href")
    @classmethod
    def safe_link(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if any(ord(char) <= 32 for char in value) or "\\" in value:
            raise ValueError("Link contains invalid characters.")
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https", "mailto"}:
            raise ValueError("Links must use http, https or mailto.")
        if not (parsed.netloc if parsed.scheme in {"http", "https"} else parsed.path):
            raise ValueError("Link destination is required.")
        return value


class LegalMark(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["bold", "italic", "link"]
    attrs: LegalAttributes | None = None

    @model_validator(mode="after")
    def validate_mark(self):
        attributes = self.attrs.model_dump(exclude_none=True, by_alias=True) if self.attrs else {}
        if self.type == "link":
            if not attributes.get("href") or set(attributes) - {"href", "target", "rel", "class", "title"}:
                raise ValueError("A link requires a valid destination.")
        elif attributes:
            raise ValueError("Formatting does not accept attributes.")
        return self


class LegalNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "text", "hardBreak", "organizationVariable"]
    attrs: LegalAttributes | None = None
    text: str | None = None
    marks: list[LegalMark] | None = None
    content: list[LegalNode] | None = None

    @model_validator(mode="after")
    def validate_node(self):
        attributes = self.attrs.model_dump(exclude_none=True, by_alias=True) if self.attrs else {}
        allowed_attributes = {"heading": {"level"}, "orderedList": {"start", "type"}, "organizationVariable": {"name"}}.get(self.type, set())
        if set(attributes) - allowed_attributes:
            raise ValueError("Unsupported node attributes.")
        if self.type == "heading" and "level" not in attributes:
            raise ValueError("Heading level is required.")
        if self.type == "organizationVariable" and "name" not in attributes:
            raise ValueError("Organization variable name is required.")
        inline = {"text", "hardBreak", "organizationVariable"}
        blocks = {"paragraph", "heading", "bulletList", "orderedList"}
        allowed_children = {"doc": blocks, "paragraph": inline, "heading": inline, "bulletList": {"listItem"}, "orderedList": {"listItem"}, "listItem": blocks}.get(self.type, set())
        if any(child.type not in allowed_children for child in self.content or []):
            raise ValueError("Unsupported document structure.")
        if self.type == "text":
            if not self.text:
                raise ValueError("Text nodes must contain text.")
        elif self.text is not None:
            raise ValueError("Only text nodes can contain text.")
        if self.marks and self.type not in {"text", "organizationVariable"}:
            raise ValueError("Only inline text can be formatted.")
        if self.type == "listItem" and (not self.content or self.content[0].type != "paragraph"):
            raise ValueError("List items must begin with a paragraph.")
        return self


class LegalDocumentWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    eyebrow: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=3000)
    summary_title: str = Field(default="", max_length=200)
    summary: str = Field(default="", max_length=5000)
    body: LegalNode

    @field_validator("body", mode="before")
    @classmethod
    def limit_document(cls, value):
        raw = value.model_dump(exclude_none=True) if isinstance(value, LegalNode) else value
        if len(json.dumps(raw)) > 250000:
            raise ValueError("Document is too large.")
        pending = [(raw, 0)]
        while pending:
            node, depth = pending.pop()
            if depth > 20:
                raise ValueError("Document nesting is too deep.")
            if isinstance(node, dict):
                pending.extend((child, depth + 1) for child in node.get("content", []) or [])
        return value

    @field_validator("body")
    @classmethod
    def useful_document(cls, body: LegalNode) -> LegalNode:
        pending = [body]
        useful = False
        while pending:
            node = pending.pop()
            useful = useful or bool(node.type == "text" and node.text and node.text.strip())
            pending.extend(node.content or [])
        if body.type != "doc" or not useful:
            raise ValueError("Document body must contain meaningful text.")
        return body


class LegalDocumentResponse(LegalDocumentWrite):
    model_config = ConfigDict(from_attributes=True)
    document_type: LegalDocumentType
    locale: LegalLocale
    updated_at: datetime


class LegalDocumentListResponse(BaseModel):
    items: list[LegalDocumentResponse]
    organization_name: str
    organization_contact: str


class PublicLegalDocumentResponse(BaseModel):
    document: LegalDocumentResponse
    requested_locale: LegalLocale
    is_fallback: bool
    organization_name: str
    organization_contact: str
