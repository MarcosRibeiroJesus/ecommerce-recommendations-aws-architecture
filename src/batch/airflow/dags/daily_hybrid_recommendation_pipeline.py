"""Apache Airflow DAG for Daily Hybrid Recommendation Batch Pipeline.
Runs on Amazon MWAA (mw1.small). Coordinates S3 Sensor, Athena, Glue, SageMaker, and publishing.
"""
from datetime import datetime, timedelta

try:
    from airflow import DAG
    from airflow.operators.empty import EmptyOperator
    from airflow.providers.amazon.aws.operators.athena import AthenaOperator
    from airflow.providers.amazon.aws.operators.glue import GlueJobOperator
    from airflow.providers.amazon.aws.operators.sagemaker import SageMakerTrainingOperator
    from airflow.providers.amazon.aws.sensors.s3 import S3KeySensor
except ImportError:
    # Stub classes for local validation and testing when airflow packages are not in global python
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
        bucket_name="ecommerce-recommendations-golden-dataset",
        bucket_key="interactions/year={{ ds_nodash[:4] }}/month={{ ds_nodash[4:6] }}/day={{ ds_nodash[6:8] }}/_SUCCESS",
        timeout=3600,
        poke_interval=60,
        mode="reschedule",
    )

    # 2. Extract and pre-aggregate curated interaction features via Athena
    athena_extract_curated_features = AthenaOperator(
        task_id="athena_extract_curated_features",
        query="src/batch/athena/extract_curated_features.sql",
        database="ecommerce_golden_db",
        output_location="s3://ecommerce-recommendations-golden-dataset/athena_results/",
        workgroup="recommendations_analytics",
    )

    # 3. AWS Glue PySpark ETL Feature Engineering with Job Bookmarks
    glue_feature_engineering = GlueJobOperator(
        task_id="glue_feature_engineering",
        job_name="ecommerce_feature_engineering",
        script_location="s3://ecommerce-recommendations-golden-dataset/scripts/feature_engineering.py",
        s3_bucket="ecommerce-recommendations-golden-dataset",
        iam_role_name="ecommerce-glue-role",
        num_of_dpus=2,
    )

    # 4. SageMaker Spot Instance Collaborative Filtering Training & 128-dim Embedding Generation
    sagemaker_train_model = SageMakerTrainingOperator(
        task_id="sagemaker_train_model",
        config={
            "TrainingJobName": "hybrid-rec-spot-{{ ds_nodash }}",
            "AlgorithmSpecification": {
                "TrainingImage": "683313688378.dkr.ecr.us-east-1.amazonaws.com/sagemaker-xgboost:1.7-1",
                "TrainingInputMode": "File",
            },
            "RoleArn": "arn:aws:iam::123456789012:role/ecommerce-sagemaker-role",
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
        job_name="publish_batch_dynamodb",
        script_location="s3://ecommerce-recommendations-golden-dataset/scripts/publish_dynamodb.py",
        s3_bucket="ecommerce-recommendations-golden-dataset",
        iam_role_name="ecommerce-glue-role",
        num_of_dpus=2,
    )

    # 5b. Publish 128-dim Float32 item embeddings to MemoryDB Redis vector index item_idx
    glue_publish_memorydb_vectors = GlueJobOperator(
        task_id="glue_publish_memorydb_vectors",
        job_name="publish_memorydb_vectors",
        script_location="s3://ecommerce-recommendations-golden-dataset/scripts/publish_memorydb_vectors.py",
        s3_bucket="ecommerce-recommendations-golden-dataset",
        iam_role_name="ecommerce-glue-role",
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
