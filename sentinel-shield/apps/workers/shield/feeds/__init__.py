from .abuse_ch import MalwareBazaarFeed, ThreatFoxFeed, URLhausFeed
from .mitre import MITREFeed
from .nvd import NVDFeed
from .phishing import OpenPhishFeed

FEED_REGISTRY = {
    "abuse_bazaar": MalwareBazaarFeed,
    "abuse_urlhaus": URLhausFeed,
    "abuse_threatfox": ThreatFoxFeed,
    "openphish": OpenPhishFeed,
    "nvd_cve": NVDFeed,
    "mitre_attack": MITREFeed,
}
