# Bedrock embeddings IAM for the ingest pipeline (issue #48).
#
# The backend ingest pipeline (backend/app/ingest/embed.py, BedrockTitanEmbedder)
# calls bedrock:InvokeModel against Titan Text Embeddings V2 to produce the
# 1024-dim vectors stored in pgvector. This defines the least-privilege policy
# that grants exactly that — scoped to the single Titan V2 foundation model in
# us-west-2 (var.region), nothing else.
#
# Foundation-model ARNs carry NO account id (the model is AWS-owned), and the
# region segment scopes the grant to us-west-2, satisfying the "in us-west-2"
# requirement on its own.
#
# This is a standalone, reusable customer-managed policy — it is intentionally
# NOT attached here:
#   - The Fargate task role (#42, not yet created) is where it ultimately
#     attaches for the deployed app; that PR consumes the ARN output below.
#   - Local-dev runs under the AWS SSO permission set (myisb_IsbUsersPS), which
#     is managed by AWS Identity Center, not this Terraform, so it can't be
#     attached from here.
#
# Out of band (not Terraformable): Bedrock model access for
# amazon.titan-embed-text-v2:0 must be enabled once in the console
# (Bedrock > Model access) for the us-west-2 sandbox account.

data "aws_iam_policy_document" "bedrock_titan_embed_invoke" {
  statement {
    sid       = "InvokeTitanEmbedV2"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel"]
    resources = ["arn:aws:bedrock:${var.region}::foundation-model/${var.bedrock_embedding_model_id}"]
  }
}

resource "aws_iam_policy" "bedrock_titan_embed_invoke" {
  name        = "empress-bedrock-titan-embed-invoke"
  description = "Allow bedrock:InvokeModel for Titan Text Embeddings V2 in ${var.region} (issue #48)."
  policy      = data.aws_iam_policy_document.bedrock_titan_embed_invoke.json
}

# Claude Sonnet 4.6 is not available for in-Region inference from us-west-2.
# The backend therefore invokes the US cross-Region inference profile, which
# can route requests to us-east-1, us-east-2, or us-west-2. AWS requires IAM
# access to both the profile ARN and every destination foundation-model ARN.
data "aws_caller_identity" "current" {}

locals {
  bedrock_chat_foundation_model_id = trimprefix(
    var.bedrock_chat_inference_profile_id,
    "us.",
  )
  bedrock_chat_inference_profile_arn = "arn:aws:bedrock:${var.region}:${data.aws_caller_identity.current.account_id}:inference-profile/${var.bedrock_chat_inference_profile_id}"
  bedrock_chat_destination_regions   = ["us-east-1", "us-east-2", "us-west-2"]
}

data "aws_iam_policy_document" "bedrock_claude_chat_invoke" {
  statement {
    sid    = "InvokeClaudeChatInferenceProfile"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = [local.bedrock_chat_inference_profile_arn]
  }

  statement {
    sid    = "InvokeClaudeChatDestinationModelsViaProfile"
    effect = "Allow"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = [
      for region in local.bedrock_chat_destination_regions :
      "arn:aws:bedrock:${region}::foundation-model/${local.bedrock_chat_foundation_model_id}"
    ]

    condition {
      test     = "StringLike"
      variable = "bedrock:InferenceProfileArn"
      values   = [local.bedrock_chat_inference_profile_arn]
    }
  }
}

resource "aws_iam_policy" "bedrock_claude_chat_invoke" {
  name        = "empress-bedrock-claude-chat-invoke"
  description = "Allow Claude Sonnet 4.6 chat through the US Bedrock inference profile (issue #70)."
  policy      = data.aws_iam_policy_document.bedrock_claude_chat_invoke.json
}
