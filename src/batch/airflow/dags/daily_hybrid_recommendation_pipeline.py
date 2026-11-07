"""Apache Airflow DAG for Daily Hybrid Recommendation Batch Pipeline.
Runs on Amazon MWAA (mw1.small). Coordinates S3 Sensor, Athena, Glue, SageMaker, and publishing
with parameterized resource names aligned with Terraform modules.
"""
import os
from datetime import datetime, timedelta

try:
    from airflow import DAG
    from airflow.operators.empty import EmptyOperator
    from airflow.providers.amazon.aws.operators.athena import AthenaOperator
    from airflow.providers.amazon.aws.operators.glue import GlueJobOperator
    from airflow.providers.amazon.aws.operators.sagemaker import SageMakerTrainingOperator
    from airflow.providers.amazon.aws.sensors.s3 import S3KeySensor
except ImportError:
    class DAG:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass

    class BaseOperatorStub:
        def __init__(self, *args, **kwargs):
            pass
        def __rshift__(self, other):
            return other

    EmptyOperator = BaseOperatorStub
    AthenaOperator = BaseOperatorStub
    GlueJobOperator = BaseOperatorStub
    SageMakerTrainingOperator = BaseOperatorStub
    S3KeySensor = BaseOperatorStub

PROJECT_NAME = os.environ.get("PROJECT_NAME", "ecommerce-recommendations")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "poc")
AWS_ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "123456789012")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

S3_GOLDEN_BUCKET = os.environ.get(
    "S3_GOLDEN_BUCKET", f"{PROJECT_NAME}-{ENVIRONMENT}-golden-dataset-{AWS_ACCOUNT_ID}"
)
GLUE_DATABASE = os.environ.get(
    "GLUE_DATABASE", f"{PROJECT_NAME.replace('-', '_')}_{ENVIRONMENT}_golden_db"
)
ATHENA_WORKGROUP = os.environ.get(
    "ATHENA_WORKGROUP", f"{PROJECT_NAME}-{ENVIRONMENT}-workgroup"
)
GLUE_ROLE_NAME = os.environ.get(
    "GLUE_ROLE_NAME", f"{PROJECT_NAME}-{ENVIRONMENT}-glue-role"
)
SAGEMAKER_ROLE_ARN = os.environ.get(
    "SAGEMAKER_ROLE_ARN",
    f"arn:aws:iam::{AWS_ACCOUNT_ID}:role/{PROJECT_NAME}-{ENVIRONMENT}-sagemaker-train-role",
)

default_args = {
    "owner": "data-platform",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="daily_hybrid_recommendation_pipeline",
    default_args=default_args,
    description="Daily automated batch retraining and publishing pipeline for hybrid recommendations",
    schedule_interval="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["recommendations", "hybrid", "aws", "batch"],
) as dag:

    # 1. Wait for daily interactions partition to arrive in S3 Golden Dataset
    wait_for_daily_interactions = S3KeySensor(
        task_id="wait_for_daily_interactions",
        bucket_name=S3_GOLDEN_BUCKET,
        bucket_key="interactions/year={{ ds_nodash[:4] }}/month={{ ds_nodash[4:6] }}/day={{ ds_nodash[6:8] }}/_SUCCESS",
        timeout=3600,
        poke_interval=60,
        mode="reschedule",
    )

    # 2. Extract and pre-aggregate curated interaction features via Athena
    athena_extract_curated_features = AthenaOperator(
        task_id="athena_extract_curated_features",
        query="src/batch/athena/extract_curated_features.sql",
        database=GLUE_DATABASE,
        output_location=f"s3://{S3_GOLDEN_BUCKET}/athena_results/",
        workgroup=ATHENA_WORKGROUP,
    )

    # 3. AWS Glue PySpark ETL Feature Engineering with Job Bookmarks
    glue_feature_engineering = GlueJobOperator(
        task_id="glue_feature_engineering",
        job_name=f"{PROJECT_NAME}-{ENVIRONMENT}-feature-engineering",
        script_location=f"s3://{S3_GOLDEN_BUCKET}/scripts/feature_engineering.py",
        s3_bucket=S3_GOLDEN_BUCKET,
        iam_role_name=GLUE_ROLE_NAME,
        num_of_dpus=2,
    )

    # 4. SageMaker Spot Instance Collaborative Filtering Training & 128-dim Embedding Generation
    sagemaker_train_model = SageMakerTrainingOperator(
        task_id="sagemaker_train_model",
        config={
            "TrainingJobName": "hybrid-rec-spot-{{ ds_nodash }}",
            "AlgorithmSpecification": {
                "TrainingImage": f"683313688378.dkr.ecr.{AWS_REGION}.amazonaws.com/sagemaker-xgboost:1.7-1",
                "TrainingInputMode": "File",
            },
            "RoleArn": SAGEMAKER_ROLE_ARN,
            "OutputDataConfig": {
                "S3OutputPath": f"s3://{S3_GOLDEN_BUCKET}/models/"
            },
            "ResourceConfig": {
                "InstanceCount": 1,
                "InstanceType": "ml.m5.xlarge",
                "VolumeSizeInGB": 30,
            },
            "StoppingCondition": {
                "MaxRuntimeInSeconds": 3600,
                "MaxWaitTimeInSeconds": 7200,
            },
            "EnableManagedSpotTraining": True,
        },
    )

    # 5a. Publish Top-50 precomputed batch recommendations to DynamoDB with 7-day TTL
    glue_publish_dynamodb = GlueJobOperator(
        task_id="glue_publish_dynamodb",
        job_name=f"{PROJECT_NAME}-{ENVIRONMENT}-publish-batch-dynamodb",
        script_location=f"s3://{S3_GOLDEN_BUCKET}/scripts/publish_dynamodb.py",
        s3_bucket=S3_GOLDEN_BUCKET,
        iam_role_name=GLUE_ROLE_NAME,
        num_of_dpus=2,
    )

    # 5b. Publish 128-dim Float32 item embeddings to MemoryDB Redis vector index item_idx
    glue_publish_memorydb_vectors = GlueJobOperator(
        task_id="glue_publish_memorydb_vectors",
        job_name=f"{PROJECT_NAME}-{ENVIRONMENT}-publish-memorydb-vectors",
        script_location=f"s3://{S3_GOLDEN_BUCKET}/scripts/publish_memorydb_vectors.py",
        s3_bucket=S3_GOLDEN_BUCKET,
        iam_role_name=GLUE_ROLE_NAME,
        num_of_dpus=2,
    )

    # Execution dependency chain
    (
        wait_for_daily_interactions
        >> athena_extract_curated_features
        >> glue_feature_engineering
        >> sagemaker_train_model
        >> [glue_publish_dynamodb, glue_publish_memorydb_vectors]
    )
