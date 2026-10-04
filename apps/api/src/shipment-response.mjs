export function publicShipmentResponse(
  shipment
) {
  if (
    shipment === null ||
    typeof shipment !== "object" ||
    Array.isArray(shipment)
  ) {
    return shipment;
  }

  const {
    aggregate: _aggregate,
    ...response
  } = shipment;

  return response;
}

export function publicShipmentListResponse(
  result
) {
  if (
    result === null ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    return result;
  }

  return {
    ...result,
    items: Array.isArray(result.items)
      ? result.items.map(
          publicShipmentResponse
        )
      : []
  };
}
