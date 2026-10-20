import {
  type AiAuthMethod,
  type AiProvider,
  useAiConfigStatus,
  useAiModels,
  useDeleteAiConfig,
  useUpdateAiConfig,
} from "@/features/settings";
import { Button } from "components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Input } from "components/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface ApiKeyCardProps {
  token?: string;
  orgId?: string | null;
}

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

const DEFAULT_PROVIDER: AiProvider = "openai";
const DEFAULT_AUTH_METHOD: AiAuthMethod = "API_KEY";
const DEFAULT_MODEL = "openai/gpt-5.2-codex";

export function ApiKeyCard({ token, orgId }: ApiKeyCardProps) {
  const [credentialInput, setCredentialInput] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(DEFAULT_PROVIDER);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);

  const { data: aiConfigStatus, isLoading } = useAiConfigStatus(token, orgId);
  const { data: modelsData, isLoading: isLoadingModels } = useAiModels(provider, token, orgId);
  const updateAiConfig = useUpdateAiConfig(token, orgId);
  const deleteAiConfig = useDeleteAiConfig(token, orgId);

  const modelOptions = modelsData?.models ?? [];

  useEffect(() => {
    if (!aiConfigStatus) {
      return;
    }

    setProvider(aiConfigStatus.provider || DEFAULT_PROVIDER);
    setModel(aiConfigStatus.model || DEFAULT_MODEL);
  }, [aiConfigStatus]);

  useEffect(() => {
    if (modelOptions.length === 0) {
      return;
    }

    const hasCurrentModel = modelOptions.some((option) => option.id === model);
    if (!hasCurrentModel) {
      const defaultOption = modelOptions.find((option) => option.id === DEFAULT_MODEL);
      setModel(defaultOption?.id || modelOptions[0].id);
    }
  }, [modelOptions, model]);

  const credentialPlaceholder = useMemo(() => {
    return provider === "anthropic" ? "sk-ant-..." : "sk-...";
  }, [provider]);

  const helperText = useMemo(() => {
    if (provider === "anthropic") {
      return "Enter an Anthropic API key for Claude models (starts with sk-ant-...).";
    }

    return "Enter an OpenAI API key for OpenAI models (starts with sk-...).";
  }, [provider]);

  const handleSave = async () => {
    if (!credentialInput.trim()) {
      return;
    }

    try {
      await updateAiConfig.mutateAsync({
        provider,
        authMethod: DEFAULT_AUTH_METHOD,
        model,
        credential: credentialInput.trim(),
      });
      setCredentialInput("");
      setShowInput(false);
      toast.success("AI configuration saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save AI configuration");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAiConfig.mutateAsync();
      toast.success("AI configuration removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove AI configuration");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Credentials</CardTitle>
        <CardDescription>
          Self-sufficient plans use your own API key for the selected model provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading ? (
            <Input type="text" value="Loading credentials..." readOnly disabled />
          ) : aiConfigStatus?.hasCredential && !showInput ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  Provider: {PROVIDER_LABELS[aiConfigStatus.provider || "anthropic"]}
                </div>
                <div className="text-sm text-muted-foreground">Method: API key</div>
                <div className="text-sm text-muted-foreground">Model: {aiConfigStatus.model}</div>
                <div className="flex items-center gap-2 mb-4">
                  <Input
                    type="password"
                    value={aiConfigStatus.maskedCredential || ""}
                    readOnly
                    disabled
                  />
                  <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => setShowInput(true)}>Update</Button>
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={deleteAiConfig.isPending}
                >
                  {deleteAiConfig.isPending && <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin mr-2" />}
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Provider</div>
                  <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
                    <SelectTrigger fullWidth>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Model</div>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger fullWidth>
                      <SelectValue
                        placeholder={isLoadingModels ? "Loading models..." : "Select model"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">API Key</div>
                  <Input
                    type="password"
                    placeholder={credentialPlaceholder}
                    value={credentialInput}
                    onChange={(e) => setCredentialInput(e.target.value)}
                  />
                </div>
                <div className="flex gap-3 mt-4">
                  <Button
                    onClick={handleSave}
                    disabled={!credentialInput.trim() || !model || updateAiConfig.isPending}
                  >
                    {updateAiConfig.isPending && <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />}
                    {updateAiConfig.isPending ? "Saving..." : "Save"}
                  </Button>
                  {showInput && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowInput(false);
                        setCredentialInput("");
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{helperText}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
