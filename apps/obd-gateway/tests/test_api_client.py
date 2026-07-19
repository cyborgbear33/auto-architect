import pytest
from obd_gateway.api_client import ApiClient, ApiClientError


class FakeHttpResponse:
    def __init__(self, status_code: int, json_body):
        self.status_code = status_code
        self._json_body = json_body
        self.text = str(json_body)

    def json(self):
        return self._json_body


class FakeSession:
    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc
        self.last_request = None

    def post(self, url, json, timeout):
        self.last_request = {"url": url, "json": json, "timeout": timeout}
        if self._exc:
            raise self._exc
        return self._response


def test_post_observation_batch_urlencodes_vehicle_id_and_returns_json():
    session = FakeSession(response=FakeHttpResponse(202, {"accepted": True}))
    client = ApiClient("http://localhost:4100", session=session)
    result = client.post_observation_batch("veh:jeep-renegade-2015-latitude", {"vehicleId": "x"})
    assert result == {"accepted": True}
    assert (
        session.last_request["url"]
        == "http://localhost:4100/api/vehicles/veh%3Ajeep-renegade-2015-latitude/observations"
    )


def test_post_observation_batch_raises_on_http_error_with_body():
    session = FakeSession(response=FakeHttpResponse(422, {"error": {"code": "VALIDATION_FAILED"}}))
    client = ApiClient("http://localhost:4100", session=session)
    with pytest.raises(ApiClientError) as excinfo:
        client.post_observation_batch("veh:x", {})
    assert excinfo.value.status_code == 422
    assert excinfo.value.body == {"error": {"code": "VALIDATION_FAILED"}}


def test_post_observation_batch_wraps_network_errors():
    import requests

    session = FakeSession(exc=requests.ConnectionError("refused"))
    client = ApiClient("http://localhost:4100", session=session)
    with pytest.raises(ApiClientError, match="could not reach the API"):
        client.post_observation_batch("veh:x", {})
