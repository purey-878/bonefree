#!/bin/bash

# Test script for new admin endpoints
# Make sure the server is running on port 8000

ADMIN_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbkBnbWFpbC5jb20iLCJleHAiOjE3NzY3OTQ5OTN9.w4KWT5qBf-lBREGMypLy0JiFH-DA2t_R37h2b81Pj2c"
BASE_URL="http://localhost:8000"

echo "Testing Admin Dashboard Endpoints..."
echo "===================================="

# Test 1: Get Dashboard Analytics
echo -e "\n1. Get Dashboard Analytics:"
curl -s -X GET "$BASE_URL/admin/analytics/dashboard" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python -m json.tool

# Test 2: Get Low Stock Products
echo -e "\n\n2. Get Low Stock Products:"
curl -s -X GET "$BASE_URL/admin/analytics/low-stock" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python -m json.tool

# Test 3: Get Popular Products
echo -e "\n\n3. Get Popular Products (Top 5):"
curl -s -X GET "$BASE_URL/admin/analytics/popular-products" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python -m json.tool

# Test 4: Get Sales Performance (Last 7 days)
echo -e "\n\n4. Get Sales Performance (Last 7 days):"
curl -s -X GET "$BASE_URL/admin/analytics/sales-performance?days=7" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python -m json.tool

# Test 5: Get Orders List
echo -e "\n\n5. Get Orders List:"
curl -s -X GET "$BASE_URL/admin/orders" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python -m json.tool

# Test 6: List Products
echo -e "\n\n6. List Products:"
curl -s -X GET "$BASE_URL/admin/products" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python -m json.tool

echo -e "\n\nTests completed!"
