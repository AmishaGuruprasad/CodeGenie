from .providers.MistralProvider import  MistralProvider 
from exceptions.llm_exceptions import ProviderNotFound
class ProviderFactory: 
    def __init__(self): 
        self.providers = { 
            "mistral" : MistralProvider(), 
            # "deepseek" : DeepSeekLocalProvider() 
            } 
        
    def get_provider(self, provider: str): 
        if provider in self.providers.keys(): 
            return self.providers[provider] 
        else: 
            raise ProviderNotFound(provider + "provider not found.")